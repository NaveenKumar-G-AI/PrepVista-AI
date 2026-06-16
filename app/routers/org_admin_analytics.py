"""
PrepVista AI - Super Admin Analytics
"""

from __future__ import annotations

import csv
import io
import json
import statistics as _stats

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin
from typing import Any

from app.routers.org_admin_helpers import (
    ORG_DEFAULT_PAGE_SIZE,
    _RUBRIC_CATEGORIES,
    _TIER_READY, _TIER_ALMOST_READY, _TIER_DEVELOPING, _TIER_AT_RISK,
    _paginate,
    _validate_uuid,
    _safe_round,
    _readiness_tier,
    _zero_offer_risk,
    _extract_cat_scores,
    _cohort_category_averages,
    _sorted_categories,
    _build_traffic_light,
    _build_score_distribution,
    _days_to_expiry,
    _renewal_risk_label,
    _compute_org_perf_summary,
    _fetch_all_orgs_perf,
    _fetch_org_perf_aggregate,
    _sanitize_csv_cell,
)

router = APIRouter()
@router.get("/organizations/{org_id}/students")
async def get_org_students_admin(
    org_id: str,
    page: int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT os.*, p.email, p.full_name, p.plan,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id
               WHERE os.organization_id = $1 AND os.status != 'removed'
               ORDER BY os.added_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset,
        )
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND status != 'removed'",
            org_id,
        )
    return {"students": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.get("/organizations/{org_id}/analytics")
async def get_org_analytics_admin(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Org analytics for platform admin oversight.

    Existing fields unchanged: organization, total_students,
    career_access_students, department_stats, year_stats.

    New fields appended (non-breaking): cohort_avg_score, scored_students,
    sessions_per_student, category_averages, weakest_categories,
    readiness_distribution, zero_offer_risk_count, zero_offer_risk_pct,
    renewal_risk, days_to_expiry, viz_shapes (traffic_light, radar,
    score_distribution, diverging_bar).
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        # ── Existing queries (unchanged) ──────────────────────────────────────
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND status = 'active'",
            org_id,
        )
        access = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'",
            org_id,
        )
        dept_stats = await conn.fetch(
            """SELECT cd.department_name, COUNT(os.id) AS total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) AS with_access
               FROM organization_students os
               JOIN college_departments cd ON cd.id = os.department_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cd.department_name ORDER BY total DESC""",
            org_id,
        )
        year_stats = await conn.fetch(
            """SELECT cy.year_name, COUNT(os.id) AS total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) AS with_access
               FROM organization_students os
               JOIN college_years cy ON cy.id = os.year_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cy.year_name ORDER BY total DESC""",
            org_id,
        )
        # NEW: full performance aggregate (one additional query)
        perf_rows = await _fetch_org_perf_aggregate(conn, org_id)

    # Python-side analytics
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

    cohort_cat_avgs = _cohort_category_averages(per_student_cats)
    global_avg      = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    std_dev         = _safe_round(_stats.stdev(scored_avgs)) if len(scored_avgs) >= 2 else None
    n_students      = len(perf_rows)
    total_sessions  = sum(int(r["session_count"] or 0) for r in perf_rows)
    sps             = _safe_round(total_sessions / n_students) if n_students > 0 else 0.0
    zero_risk_pct   = round(zero_risk_count / n_students * 100, 1) if n_students > 0 else 0.0
    dte             = _days_to_expiry(org["access_expiry"])
    renewal_risk    = _renewal_risk_label(global_avg, float(sps or 0.0), zero_risk_pct, dte)

    # Top-quartile category overlay for radar chart
    if len(scored_avgs) >= 4:
        p75     = sorted(scored_avgs)[int(len(scored_avgs) * 0.75)]
        tq_rows = [r for r in perf_rows if r["avg_score"] is not None and float(r["avg_score"]) >= p75]
    else:
        tq_rows = list(perf_rows)
    tq_cat_avgs = _cohort_category_averages([_extract_cat_scores(r) for r in tq_rows])

    dist_buckets  = _build_score_distribution(scored_avgs)
    traffic_light = _build_traffic_light(tier_counts, n_students)

    diverging_bar = [
        {
            "name":       cat,
            "cohort_avg": cohort_cat_avgs.get(cat),
            "deviation":  _safe_round(
                (cohort_cat_avgs[cat] - global_avg)
                if (cohort_cat_avgs.get(cat) is not None and global_avg is not None)
                else None
            ),
        }
        for cat in _RUBRIC_CATEGORIES
    ]
    diverging_bar.sort(key=lambda x: (x["deviation"] is None, -(x["deviation"] or 0)))

    return {
        # ── Existing fields (preserved verbatim) ──────────────────────────────
        "organization":           dict(org),
        "total_students":         total,
        "career_access_students": access,
        "department_stats":       [dict(d) for d in dept_stats],
        "year_stats":             [dict(y) for y in year_stats],
        # ── NEW fields ────────────────────────────────────────────────────────
        "cohort_avg_score":       global_avg,
        "scored_students":        len(scored_avgs),
        "sessions_per_student":   sps,
        "category_averages":      cohort_cat_avgs,
        "weakest_categories":     _sorted_categories(cohort_cat_avgs, ascending=True),
        "readiness_distribution": tier_counts,
        "zero_offer_risk_count":  zero_risk_count,
        "zero_offer_risk_pct":    zero_risk_pct,
        "renewal_risk":           renewal_risk,
        "days_to_expiry":         dte,
        "viz_shapes": {
            "traffic_light":   traffic_light,
            "radar": {
                "categories":       _RUBRIC_CATEGORIES,
                "cohort_avg":       [cohort_cat_avgs.get(c) for c in _RUBRIC_CATEGORIES],
                "top_quartile_avg": [tq_cat_avgs.get(c)    for c in _RUBRIC_CATEGORIES],
            },
            "score_distribution": {
                "buckets":        dist_buckets,
                "mean":           global_avg,
                "std_dev":        std_dev,
                "cohort_size":    n_students,
                "scored_students":len(scored_avgs),
            },
            "diverging_bar": diverging_bar,
        },
    }


@router.get("/organizations/{org_id}/access-log")
async def get_org_access_log_admin(
    org_id: str,
    page: int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Paginated access log for one org.

    ✅ FIXED: Added `total` and pagination metadata — previously missing, making
    frontend page controls impossible.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT oal.*, p1.email AS student_email, p2.email AS admin_email
               FROM organization_access_log oal
               LEFT JOIN profiles p1 ON p1.id = oal.student_user_id
               LEFT JOIN profiles p2 ON p2.id = oal.admin_user_id
               WHERE oal.organization_id = $1 ORDER BY oal.created_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset,
        )
        # ✅ FIXED: total now included
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_access_log WHERE organization_id = $1",
            org_id,
        )
    return {
        "access_log": [dict(r) for r in rows],
        "total":      total,
        "page":       page,
        "page_size":  ps,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PLAN MANAGEMENT  (all N+1 bugs fixed, all transactions added)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def org_admin_dashboard(admin: UserProfile = Depends(require_main_admin())):
    """Platform-wide dashboard for the main admin.

    Existing fields preserved verbatim: total_organizations, active_organizations,
    total_students, total_career_access, recent_organizations.

    ✅ FIXED: Was 5 separate fetchval round-trips. Now 2 queries total:
      one multi-aggregate counts query + one cross-org performance query.

    NEW: platform_performance (orgs_with_data, platform_avg_score, total_sessions),
    renewal_risk (high/medium lists, low_count), top_5_orgs, bottom_5_orgs.
    """
    async with DatabaseConnection() as conn:
        # ✅ FIXED: 4 separate fetchval calls → 1 fetchrow with FILTER aggregates
        counts = await conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE category = 'college')                       AS total_organizations,
                 COUNT(*) FILTER (WHERE category = 'college' AND status = 'active') AS active_organizations,
                 (SELECT COUNT(*) FROM organization_students WHERE status = 'active')             AS total_students,
                 (SELECT COUNT(*) FROM organization_students
                  WHERE has_career_access = TRUE AND status = 'active')                          AS total_career_access
               FROM organizations"""
        )
        recent_orgs = await conn.fetch(
            "SELECT id, name, org_code, status, seat_limit, seats_used, created_at "
            "FROM organizations WHERE category = 'college' ORDER BY created_at DESC LIMIT 10"
        )
        # NEW: cross-org performance aggregate (one query for the entire platform)
        all_orgs_perf = await _fetch_all_orgs_perf(conn)

    # Python-side platform performance computation — zero additional DB round-trips
    scored_orgs  = [r for r in all_orgs_perf if r["avg_score"] is not None]
    all_avgs     = [float(r["avg_score"]) for r in scored_orgs]
    platform_avg = _safe_round(_stats.mean(all_avgs)) if all_avgs else None
    plat_sessions = sum(int(r["total_sessions"] or 0) for r in all_orgs_perf)
    plat_students = sum(int(r["total_students"] or 0) for r in all_orgs_perf)

    # Renewal risk bucketing
    risk_high: list[dict] = []
    risk_med:  list[dict] = []
    risk_low_count = 0

    for r in all_orgs_perf:
        total_stu = int(r["total_students"] or 0)
        total_ses = int(r["total_sessions"] or 0)
        avg       = _safe_round(r["avg_score"])
        sps       = total_ses / total_stu if total_stu > 0 else 0.0
        dte       = _days_to_expiry(r["access_expiry"])
        # zero_risk_pct not available at cross-org summary level (no per-student rows)
        risk      = _renewal_risk_label(avg, sps, 0.0, dte)
        entry = {
            "org_id":              str(r["org_id"]),
            "name":                r["name"],
            "org_code":            r["org_code"],
            "avg_score":           avg,
            "sessions_per_student":_safe_round(sps),
            "days_to_expiry":      dte,
            "renewal_risk":        risk,
        }
        if risk == "high":
            risk_high.append(entry)
        elif risk == "medium":
            risk_med.append(entry)
        else:
            risk_low_count += 1

    # Top-5 and bottom-5 orgs by avg_score
    sorted_by_score = sorted(scored_orgs, key=lambda r: float(r["avg_score"]), reverse=True)

    def _rank_entry(r: Any) -> dict:
        total_stu = int(r["total_students"] or 0)
        total_ses = int(r["total_sessions"] or 0)
        return {
            "org_id":              str(r["org_id"]),
            "name":                r["name"],
            "org_code":            r["org_code"],
            "avg_score":           _safe_round(r["avg_score"]),
            "sessions_per_student":_safe_round(total_ses / total_stu) if total_stu else 0.0,
            "total_students":      total_stu,
        }

    top_5    = [_rank_entry(r) for r in sorted_by_score[:5]]
    bottom_5 = [_rank_entry(r) for r in sorted_by_score[-5:]][::-1]  # worst first

    return {
        # ── Existing fields (preserved verbatim) ──────────────────────────────
        "total_organizations":  counts["total_organizations"]  if counts else 0,
        "active_organizations": counts["active_organizations"] if counts else 0,
        "total_students":       counts["total_students"]       if counts else 0,
        "total_career_access":  counts["total_career_access"]  if counts else 0,
        "recent_organizations": [dict(r) for r in recent_orgs],
        # ── NEW: platform performance block ───────────────────────────────────
        "platform_performance": {
            "orgs_with_data":            len(scored_orgs),
            "platform_avg_score":        platform_avg,
            "total_sessions_platform":   plat_sessions,
            "sessions_per_student_platform": _safe_round(plat_sessions / plat_students) if plat_students else 0.0,
        },
        "renewal_risk": {
            "high":      risk_high,
            "medium":    risk_med,
            "low_count": risk_low_count,
        },
        "top_5_orgs":    top_5,
        "bottom_5_orgs": bottom_5,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NEW: GET /organizations/{org_id}/performance  (Q1, Q2, Q3, Q6)
# Full performance viz payload for one org — platform admin scope.
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/performance")
async def get_org_performance_admin(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Full performance analytics for one org as seen by platform admin.

    Returns every viz shape needed for the admin's org performance detail tab:
      radar polygon, per-student table (tier + cohort percentile + risk),
      department × category comparison, score distribution, traffic-light,
      diverging bar, renewal_risk, days_to_expiry.

    Two SQL queries: org lookup + per-student perf aggregate.
    All derived metrics computed in Python.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        perf_rows = await _fetch_org_perf_aggregate(conn, org_id)

    perf_summary = _compute_org_perf_summary(perf_rows, org_row=org)

    total       = len(perf_rows)
    scored_avgs = [float(r["avg_score"]) for r in perf_rows if r["avg_score"] is not None]
    global_avg  = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    std_dev     = _safe_round(_stats.stdev(scored_avgs)) if len(scored_avgs) >= 2 else None

    # Top-quartile threshold (75th percentile of this org's cohort)
    p75_threshold = sorted(scored_avgs)[int(len(scored_avgs) * 0.75)] if len(scored_avgs) >= 4 else None
    tq_rows: list = []

    student_summaries: list[dict] = []
    tier_counts: dict[str, int]   = {
        _TIER_READY: 0, _TIER_ALMOST_READY: 0, _TIER_DEVELOPING: 0, _TIER_AT_RISK: 0,
    }
    zero_risk_count   = 0
    per_student_cats: list[dict[str, float | None]] = []

    # Department grouping for dept comparison
    dept_map:   dict[str, list[dict[str, float | None]]] = {}
    dept_scores:dict[str, list[float]]                   = {}
    dept_counts:dict[str, int]                           = {}

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        risk = _zero_offer_risk(avg, sc, None)
        pct  = (
            round(sum(1 for s in scored_avgs if s <= float(avg)) / len(scored_avgs) * 100, 1)
            if (avg is not None and scored_avgs)
            else None
        )
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        if risk:
            zero_risk_count += 1
        if p75_threshold is not None and avg is not None and float(avg) >= p75_threshold:
            tq_rows.append(r)

        cat_scores = _extract_cat_scores(r)
        per_student_cats.append(cat_scores)

        # Department grouping
        dk = r["department_name"] or "Unassigned"
        dept_map.setdefault(dk, []).append(cat_scores)
        dept_counts[dk] = dept_counts.get(dk, 0) + 1
        if avg is not None:
            dept_scores.setdefault(dk, []).append(float(avg))

        student_summaries.append({
            "user_id":          str(r["user_id"]),
            "name":             r["full_name"],
            "email":            r["email"],
            "student_code":     r["student_code"],
            "department_name":  r["department_name"],
            "session_count":    sc,
            "avg_score":        avg,
            "readiness_tier":   tier,
            "zero_offer_risk":  risk,
            "cohort_percentile":pct,
            "category_scores":  cat_scores,
        })

    cohort_cat_avgs = _cohort_category_averages(per_student_cats)
    tq_cat_avgs     = _cohort_category_averages([_extract_cat_scores(r) for r in tq_rows])
    dist_buckets    = _build_score_distribution(scored_avgs)
    traffic_light   = _build_traffic_light(tier_counts, total)

    diverging_bar = [
        {
            "name":       cat,
            "cohort_avg": cohort_cat_avgs.get(cat),
            "deviation":  _safe_round(
                (cohort_cat_avgs[cat] - global_avg)
                if (cohort_cat_avgs.get(cat) is not None and global_avg is not None)
                else None
            ),
        }
        for cat in _RUBRIC_CATEGORIES
    ]
    diverging_bar.sort(key=lambda x: (x["deviation"] is None, -(x["deviation"] or 0)))

    dept_comparison = [
        {
            "department_name": dk,
            "student_count":   dept_counts[dk],
            "avg_score":       _safe_round(_stats.mean(dept_scores.get(dk, []))) if dept_scores.get(dk) else None,
            "category_scores": _cohort_category_averages(dept_map[dk]),
        }
        for dk in sorted(dept_counts.keys())
    ]
    dept_comparison.sort(key=lambda x: (x["avg_score"] is None, -(x["avg_score"] or 0)))

    return {
        "organization":       dict(org),
        "performance_summary":perf_summary,
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
        "students":               student_summaries,
        "department_comparison":  dept_comparison,
        "viz_shapes": {
            "radar": {
                "categories":       _RUBRIC_CATEGORIES,
                "cohort_avg":       [cohort_cat_avgs.get(c) for c in _RUBRIC_CATEGORIES],
                "top_quartile_avg": [tq_cat_avgs.get(c)    for c in _RUBRIC_CATEGORIES],
            },
            "traffic_light":   traffic_light,
            "diverging_bar":   diverging_bar,
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
# NEW: GET /organizations/{org_id}/readiness  (Q1, Q5, Q6)
# Readiness grid for one org — platform admin scope.
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/readiness")
async def get_org_readiness_admin(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Readiness grid and zero-offer risk list for one org — platform admin view.

    Mirrors org_college.py /analytics/readiness shape exactly.
    One SQL query + Python classification.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow(
            "SELECT id, name, access_expiry FROM organizations WHERE id = $1", org_id
        )
        if not org:
            raise HTTPException(404, "Organization not found.")
        perf_rows = await _fetch_org_perf_aggregate(conn, org_id)

    scored_avgs = [float(r["avg_score"]) for r in perf_rows if r["avg_score"] is not None]
    tier_buckets: dict[str, list[dict]] = {
        _TIER_READY: [], _TIER_ALMOST_READY: [], _TIER_DEVELOPING: [], _TIER_AT_RISK: [],
    }
    zero_risk_list: list[dict] = []

    for r in perf_rows:
        sc   = int(r["session_count"] or 0)
        avg  = _safe_round(r["avg_score"])
        tier = _readiness_tier(avg, sc)
        risk = _zero_offer_risk(avg, sc, None)
        pct  = (
            round(sum(1 for s in scored_avgs if s <= float(avg)) / len(scored_avgs) * 100, 1)
            if (avg is not None and scored_avgs)
            else None
        )
        entry = {
            "user_id":          str(r["user_id"]),
            "name":             r["full_name"],
            "email":            r["email"],
            "student_code":     r["student_code"],
            "department_name":  r["department_name"],
            "session_count":    sc,
            "avg_score":        avg,
            "readiness_tier":   tier,
            "cohort_percentile":pct,
            "zero_offer_risk":  risk,
        }
        tier_buckets[tier].append(entry)
        if risk:
            zero_risk_list.append(entry)

    total      = len(perf_rows)
    tier_counts = {k: len(v) for k, v in tier_buckets.items()}

    return {
        "organization":          {"id": str(org["id"]), "name": org["name"]},
        "summary":               {"total_students": total, "zero_offer_risk_count": len(zero_risk_list)},
        "readiness_distribution":tier_counts,
        "traffic_light":         _build_traffic_light(tier_counts, total),
        "tiers": {
            _TIER_READY:        tier_buckets[_TIER_READY],
            _TIER_ALMOST_READY: tier_buckets[_TIER_ALMOST_READY],
            _TIER_DEVELOPING:   tier_buckets[_TIER_DEVELOPING],
            _TIER_AT_RISK:      tier_buckets[_TIER_AT_RISK],
        },
        "zero_offer_risk": zero_risk_list,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NEW: GET /organizations/summary-analytics  (P1, P2, Q6)
# Cross-org comparison table for platform admin bird's-eye view.
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/summary-analytics")
async def org_summary_analytics(admin: UserProfile = Depends(require_main_admin())):
    """Cross-org performance comparison table.

    Returns one row per college with avg_score, all 14 category averages,
    renewal risk, sessions_per_student, and org metadata.

    Also returns platform-wide aggregates: platform avg_score, renewal risk
    breakdown, top-5 / bottom-5 performing orgs.

    One SQL query. All derived metrics computed in Python.
    """
    async with DatabaseConnection() as conn:
        all_orgs_perf = await _fetch_all_orgs_perf(conn)

    scored_avgs  = [float(r["avg_score"]) for r in all_orgs_perf if r["avg_score"] is not None]
    platform_avg = _safe_round(_stats.mean(scored_avgs)) if scored_avgs else None
    risk_counts  = {"high": 0, "medium": 0, "low": 0}

    orgs_out: list[dict] = []
    for r in all_orgs_perf:
        total_stu = int(r["total_students"] or 0)
        total_ses = int(r["total_sessions"] or 0)
        avg       = _safe_round(r["avg_score"])
        sps       = _safe_round(total_ses / total_stu) if total_stu > 0 else 0.0
        dte       = _days_to_expiry(r["access_expiry"])
        risk      = _renewal_risk_label(avg, float(sps or 0.0), 0.0, dte)
        cat_avgs  = _extract_cat_scores(r)
        sorted_c  = _sorted_categories(cat_avgs, ascending=True)
        weakest   = sorted_c[0]["name"] if sorted_c and sorted_c[0]["avg_score"] is not None else None
        risk_counts[risk] = risk_counts.get(risk, 0) + 1

        orgs_out.append({
            "org_id":              str(r["org_id"]),
            "name":                r["name"],
            "org_code":            r["org_code"],
            "org_status":          r["org_status"],
            "plan":                r["plan"],
            "seat_limit":          r["seat_limit"],
            "seats_used":          r["seats_used"],
            "access_expiry":       r["access_expiry"],
            "days_to_expiry":      dte,
            "total_students":      total_stu,
            "access_students":     int(r["access_students"] or 0),
            "total_sessions":      total_ses,
            "sessions_per_student":sps,
            "avg_score":           avg,
            "category_averages":   cat_avgs,
            "weakest_category":    weakest,
            "renewal_risk":        risk,
        })

    sorted_by_score = sorted(
        [o for o in orgs_out if o["avg_score"] is not None],
        key=lambda x: x["avg_score"],   # type: ignore[arg-type]
        reverse=True,
    )

    return {
        "platform_summary": {
            "total_orgs":          len(all_orgs_perf),
            "orgs_with_data":      len(scored_avgs),
            "platform_avg_score":  platform_avg,
            "renewal_risk_counts": risk_counts,
            "total_sessions":      sum(int(r["total_sessions"] or 0) for r in all_orgs_perf),
            "total_students":      sum(int(r["total_students"] or 0) for r in all_orgs_perf),
        },
        "organizations": orgs_out,
        "top_5_orgs":    sorted_by_score[:5],
        "bottom_5_orgs": sorted_by_score[-5:][::-1],   # worst-performing first
    }


# ══════════════════════════════════════════════════════════════════════════════
# NEW: GET /organizations/export  (P1, Q6)
# Cross-org CSV/JSON export for platform admin reporting.
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/export")
async def export_organizations(
    export_format: str = "json",
    admin: UserProfile = Depends(require_main_admin()),
):
    """Export all college organizations with full performance data.

    One row per org. Includes: identity fields, plan/seat data, avg_score,
    all 14 category averages, sessions/student, and renewal_risk.

    Intended for: platform business review, renewal pipeline management,
    board reporting, investor updates.

    One SQL query. Zero N+1.
    """
    async with DatabaseConnection() as conn:
        all_orgs_perf = await _fetch_all_orgs_perf(conn)

    if export_format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        cat_headers = [f"Avg {cat.replace('_', ' ').title()}" for cat in _RUBRIC_CATEGORIES]
        writer.writerow([
            "Org Name", "Org Code", "Status", "Plan",
            "Seat Limit", "Seats Used",
            "Access Expiry", "Days to Expiry",
            "Total Students", "Access Students",
            "Total Sessions", "Sessions / Student",
            "Avg Score", "Renewal Risk",
            *cat_headers,
        ])
        for r in all_orgs_perf:
            total_stu = int(r["total_students"] or 0)
            total_ses = int(r["total_sessions"] or 0)
            avg       = _safe_round(r["avg_score"])
            sps       = _safe_round(total_ses / total_stu) if total_stu > 0 else 0.0
            dte       = _days_to_expiry(r["access_expiry"])
            risk      = _renewal_risk_label(avg, float(sps or 0.0), 0.0, dte)
            writer.writerow([
                _sanitize_csv_cell(r["name"]),
                _sanitize_csv_cell(r["org_code"]),
                _sanitize_csv_cell(r["org_status"]),
                _sanitize_csv_cell(r["plan"]),
                r["seat_limit"],
                r["seats_used"],
                _sanitize_csv_cell(r["access_expiry"]),
                _sanitize_csv_cell(dte),
                total_stu,
                int(r["access_students"] or 0),
                total_ses,
                _sanitize_csv_cell(sps),
                _sanitize_csv_cell(avg),
                _sanitize_csv_cell(risk),
                *[_sanitize_csv_cell(_safe_round(r[f"avg_{cat}"])) for cat in _RUBRIC_CATEGORIES],
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=organizations_export.csv"},
        )

    # JSON response
    orgs_out = []
    for r in all_orgs_perf:
        total_stu = int(r["total_students"] or 0)
        total_ses = int(r["total_sessions"] or 0)
        avg       = _safe_round(r["avg_score"])
        sps       = _safe_round(total_ses / total_stu) if total_stu > 0 else 0.0
        dte       = _days_to_expiry(r["access_expiry"])
        risk      = _renewal_risk_label(avg, float(sps or 0.0), 0.0, dte)
        orgs_out.append({
            "org_id":              str(r["org_id"]),
            "name":                r["name"],
            "org_code":            r["org_code"],
            "org_status":          r["org_status"],
            "plan":                r["plan"],
            "seat_limit":          r["seat_limit"],
            "seats_used":          r["seats_used"],
            "access_expiry":       r["access_expiry"],
            "days_to_expiry":      dte,
            "total_students":      total_stu,
            "access_students":     int(r["access_students"] or 0),
            "total_sessions":      total_ses,
            "sessions_per_student":sps,
            "avg_score":           avg,
            "renewal_risk":        risk,
            "category_averages":   _extract_cat_scores(r),
        })
    return {"organizations": orgs_out, "total": len(orgs_out)}