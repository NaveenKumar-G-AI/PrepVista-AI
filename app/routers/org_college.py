"""
PrepVista AI — College Secondary Admin Router (Barrel / Orchestration File)
=============================================================
Endpoints under /org/my/* for college admins to manage their own organization.

This file was the original monolithic org_college router (2925 lines). It has been
surgically split into focused sub-modules while preserving every route,
constant, and import path. The routes are merged back into a single APIRouter
here so `app/main.py` requires zero changes.

Sub-modules:
  org_college_helpers.py   — Constants, formatters, stat helpers
  org_college_schemas.py   — Pydantic request models
  org_college_students.py  — Student management endpoints
  org_college_config.py    — Departments, years, batches endpoints
  org_college_analytics.py — Dashboard, analytics, and export endpoints
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.org_college_students import router as students_router
from app.routers.org_college_config import router as config_router
from app.routers.org_college_analytics import router as analytics_router
from app.routers.tpo_config import router as placement_config_router

router = APIRouter()
router.include_router(students_router)
router.include_router(config_router)
router.include_router(analytics_router)
router.include_router(placement_config_router)  # Fix 9 — /org/my/placement-config

# ── Re-export: Helpers & Constants ───────────────────────────────────────────
from app.routers.org_college_helpers import (  # noqa: F401
    _MAX_EMAIL_LEN,
    _MAX_NAME_LEN,
    _MAX_CODE_LEN,
    _MAX_NOTES_LEN,
    _MAX_SEARCH_LEN,
    _EMAIL_RE,
    _RUBRIC_CATEGORIES,
    _QUALITY_FLAG_BOOL,
    _QUALITY_FLAG_NUMERIC,
    _TIER_READY,
    _TIER_ALMOST_READY,
    _TIER_DEVELOPING,
    _TIER_AT_RISK,
    _READINESS_TARGET,
    _ZERO_OFFER_SCORE_HARD,
    _ZERO_OFFER_SCORE_SOFT,
    _ZERO_OFFER_SLOPE_FLOOR,
    _STUCK_MIN_SESSIONS,
    _STUCK_SLOPE_THRESHOLD,
    _DIST_BUCKETS,
    _CSV_INJECTION_PREFIXES,
    _validate_uuid,
    _sanitize_csv_cell,
    _compute_slope,
    _readiness_tier,
    _zero_offer_risk,
    _is_stuck,
    _compute_percentile,
    _build_score_distribution,
    _time_to_threshold,
    _safe_round,
    _extract_cat_scores,
    _cohort_category_averages,
    _sorted_categories,
    _build_radar_shape,
    _build_diverging_bar,
    _build_dept_comparison,
    _build_traffic_light,
    _build_answer_flag_aggregates,
    _segment_filter_clause,
    _fetch_perf_aggregate,
    _fetch_session_series,
    _compute_student_growth_map,
    _paginate,
    _log_action,
    _render_cohort_summary_export,
)

# ── Re-export: Schemas ───────────────────────────────────────────────────────
from app.routers.org_college_schemas import (  # noqa: F401
    AddStudentRequest,
    UpdateStudentRequest,
    SegmentRequest,
    BatchRequest,
)

# ── Re-export: Endpoints (for direct function references if any) ─────────────
from app.routers.org_college_students import (  # noqa: F401
    list_students,
    add_student,
    get_student,
    update_student,
    remove_student,
    grant_career_access,
    revoke_career_access,
    bulk_upload_students,
)
from app.routers.org_college_config import (  # noqa: F401
    list_departments,
    create_department,
    update_department,
    delete_department,
    list_years,
    create_year,
    update_year,
    delete_year,
    reorder_years,
    list_batches,
    create_batch,
    update_batch,
    delete_batch,
    college_access_log,
    college_billing,
)
from app.routers.org_college_analytics import (  # noqa: F401
    college_dashboard,
    college_analytics,
    analytics_performance,
    analytics_growth,
    analytics_readiness,
    access_control_summary,
    export_student_reports,
    export_cohort_report,
    student_performance,
)