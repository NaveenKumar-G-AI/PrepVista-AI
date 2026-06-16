"""
PrepVista AI — Super Admin Router (Barrel / Orchestration File)
=============================================================
Endpoints under /org/admin/* for PrepVista super admins to manage
all organizations, view cross-org analytics, and manage billing.

This file was the original monolithic org_admin router (1980 lines). It has been
surgically split into focused sub-modules while preserving every route,
constant, and import path. The routes are merged back into a single APIRouter
here so `app/main.py` requires zero changes.

Sub-modules:
  org_admin_helpers.py   — Constants, formatters, stat helpers
  org_admin_schemas.py   — Pydantic request models
  org_admin_orgs.py      — Organization CRUD endpoints
  org_admin_users.py     — Org Admin Users CRUD endpoints
  org_admin_billing.py   — Billing and plan management endpoints
  org_admin_analytics.py — Cross-org analytics and dashboards
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.org_admin_orgs import router as orgs_router
from app.routers.org_admin_users import router as users_router
from app.routers.org_admin_billing import router as billing_router
from app.routers.org_admin_analytics import router as analytics_router

router = APIRouter()
router.include_router(orgs_router)
router.include_router(users_router)
router.include_router(billing_router)
router.include_router(analytics_router)

# ── Re-export: Helpers & Constants ───────────────────────────────────────────
from app.routers.org_admin_helpers import (  # noqa: F401
    _MAX_EMAIL_LEN,
    _MAX_NAME_LEN,
    _MAX_CODE_LEN,
    _EMAIL_RE,
    _RUBRIC_CATEGORIES,
    _TIER_READY,
    _TIER_ALMOST_READY,
    _TIER_DEVELOPING,
    _TIER_AT_RISK,
    _ZERO_OFFER_SCORE_HARD,
    _ZERO_OFFER_SCORE_SOFT,
    _ZERO_OFFER_SLOPE_FLOOR,
    _STUCK_MIN_SESSIONS,
    _DIST_BUCKETS,
    _CSV_INJECTION_PREFIXES,
    _validate_uuid,
    _sanitize_csv_cell,
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
    _paginate,
)

# ── Re-export: Schemas ───────────────────────────────────────────────────────
from app.routers.org_admin_schemas import (  # noqa: F401
    CreateOrgRequest,
    UpdateOrgRequest,
    CreateOrgAdminRequest,
    UpdateOrgAdminRequest,
    AssignPlanRequest,
    RecordPaymentRequest,
)

# ── Re-export: Endpoints (for direct function references if any) ─────────────
from app.routers.org_admin_orgs import (  # noqa: F401
    create_organization,
    list_organizations,
    get_organization,
    update_organization,
    suspend_organization,
    activate_organization,
    delete_organization,
)
from app.routers.org_admin_users import (  # noqa: F401
    create_org_admin,
    list_org_admins,
    get_org_admin_detail,
    update_org_admin,
    disable_org_admin,
    enable_org_admin,
    reset_org_admin_password,
)
from app.routers.org_admin_billing import (  # noqa: F401
    assign_org_plan,
    record_org_payment,
    revoke_org_plan,
    grant_all_org_access,
    revoke_all_org_access,
    get_org_billing_admin,
)
from app.routers.org_admin_analytics import (  # noqa: F401
    get_org_students_admin,
    get_org_analytics_admin,
    get_org_access_log_admin,
    org_admin_dashboard,
    get_org_performance_admin,
    get_org_readiness_admin,
    org_summary_analytics,
    export_organizations,
)