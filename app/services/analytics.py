"""
PrepVista AI — Analytics Service (Barrel / Orchestration File)
=============================================================
B2C & B2B (Cohort) performance aggregation.

This file was the original monolithic analytics file (1674 lines). It has been
surgically split into focused sub-modules while preserving every function,
constant, and import path. All public and internal names are re-exported
here so that existing consumers (`from app.services.analytics import X`)
continue to work with zero changes.

Sub-modules:
  analytics_helpers.py — math helpers, normalizers, and formatting
  analytics_student.py — B2C coaching feedback, student history, DB syncing
  analytics_cohort.py  — B2B/TPO cohort performance aggregations
"""

from __future__ import annotations

# ── Re-export: Analytics Helpers ─────────────────────────────────────────────
from app.services.analytics_helpers import (  # noqa: F401
    VALID_RUBRIC_CATEGORIES,
    RUBRIC_CATEGORY_DISPLAY_ORDER,
    _BACKFILL_SESSION_LIMIT,
    FREE_NEXT_STEP_BY_CATEGORY,
    READINESS_TIER_READY,
    READINESS_TIER_ALMOST,
    READINESS_TIER_DEVELOPING,
    READINESS_TIER_AT_RISK,
    READINESS_TIER_NOT_STARTED,
    _READINESS_TIER_THRESHOLDS,
    READINESS_TIER_COLOR,
    _TREND_MIN_SESSIONS_FOR_SLOPE,
    _STUCK_MIN_SESSIONS,
    _STUCK_SLOPE_THRESHOLD,
    _DEFAULT_TARGET_SCORE,
    _MIN_SESSIONS_FOR_RISK_EVAL,
    _MIN_GRADUATION_YEAR,
    _MAX_GRADUATION_YEAR,
    _MAX_DEPARTMENT_LEN,
    _COHORT_ACTIVITY_DEFAULT_DAYS,
    _COHORT_ACTIVITY_MAX_DAYS,
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
)

# ── Re-export: Analytics Student ─────────────────────────────────────────────
from app.services.analytics_student import (  # noqa: F401
    build_dashboard_feedback,
    build_interview_neural_feedback,
    derive_skill_score_rows,
    sync_session_skill_scores,
    backfill_missing_skill_scores,
    fetch_student_session_history,
    fetch_student_category_history,
    compute_student_overall_growth,
    compute_student_category_growth,
    compute_student_readiness,
    build_student_placement_readiness,
    compute_percentile_shift,
    build_student_radar_data,
    build_student_category_trend_lines,
)

# ── Re-export: Analytics Cohort ──────────────────────────────────────────────
from app.services.analytics_cohort import (  # noqa: F401
    fetch_cohort_overall_snapshot,
    fetch_cohort_category_snapshot,
    fetch_cohort_activity,
    compute_cohort_category_rollups,
    compute_department_comparison,
    compute_cohort_percentile_distribution,
    compute_readiness_distribution,
    compute_zero_offer_risk_roster,
    compute_cohort_growth_heatmap,
    compute_role_fit_sankey,
)