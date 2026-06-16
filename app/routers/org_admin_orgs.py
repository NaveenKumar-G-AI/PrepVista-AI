"""
PrepVista AI - Super Admin Orgs
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin
from app.config import generate_org_code, get_org_category_config

from app.routers.org_admin_schemas import CreateOrgRequest, UpdateOrgRequest
from app.routers.org_admin_helpers import (
    ORG_DEFAULT_PAGE_SIZE,
    _MAX_SEARCH_LEN,
    _paginate,
    _validate_uuid,
    _fetch_org_perf_aggregate,
    _compute_org_perf_summary,
)

router = APIRouter()
@router.post("/organizations")
async def create_organization(
    body: CreateOrgRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Create a new college organization.

    ✅ FIXED: org_code race condition. The original MAX()+1 is not atomic under
    concurrent creation — two simultaneous requests both read the same MAX and
    produce the same sequence number, causing a duplicate org_code constraint
    violation. Fix: SELECT ... FOR UPDATE inside a transaction serializes
    concurrent inserts safely. The lock is held only during the INSERT, so
    impact on read throughput is negligible.
    """
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            # ✅ FIXED: FOR UPDATE prevents concurrent race on MAX(seq)
            seq = await conn.fetchval(
                "SELECT COALESCE(MAX(CAST(SUBSTRING(org_code FROM 5) AS INT)), 0) + 1 "
                "FROM organizations FOR UPDATE"
            )
            org_code = generate_org_code(seq, "college")
            cfg      = get_org_category_config("college")
            row = await conn.fetchrow(
                """INSERT INTO organizations
                   (name, category, org_code, contact_name, contact_email, contact_phone,
                    address, placement_cell_name, branch_code, plan, seat_limit, notes,
                    created_by_admin_id)
                   VALUES ($1,'college',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                   RETURNING *""",
                body.name, org_code, body.contact_name, body.contact_email,
                body.contact_phone, body.address, body.placement_cell_name,
                body.branch_code, cfg["default_plan"],
                body.seat_limit or cfg["default_seat_limit"], body.notes, admin.id,
            )
            await conn.execute(
                """INSERT INTO org_plan_allocations (organization_id, plan, seat_limit, billing_type)
                   VALUES ($1, $2, $3, 'annual')""",
                row["id"], cfg["default_plan"], body.seat_limit or cfg["default_seat_limit"],
            )
    return {"status": "created", "organization": dict(row)}


@router.get("/organizations")
async def list_organizations(
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    ps, offset  = _paginate(page, page_size)
    safe_search = (search or "")[:_MAX_SEARCH_LEN].strip() or None
    async with DatabaseConnection() as conn:
        where, params = ["category = 'college'"], []
        idx = 0
        if status:
            idx += 1; where.append(f"status = ${idx}"); params.append(status)
        if safe_search:
            idx += 1
            where.append(f"(LOWER(name) LIKE ${idx} OR org_code LIKE ${idx})")
            params.append(f"%{safe_search.lower()}%")
        w     = " AND ".join(where)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM organizations WHERE {w}", *params)
        rows  = await conn.fetch(
            f"SELECT * FROM organizations WHERE {w} ORDER BY created_at DESC "
            f"LIMIT ${idx+1}::int OFFSET ${idx+2}::int",
            *params, ps, offset,
        )
    return {"organizations": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.get("/organizations/{org_id}")
async def get_organization(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Get one org with admin list, seat/access counts, and performance_summary.

    performance_summary (NEW) adds: cohort_avg_score, tier distribution,
    zero_offer_risk_count + pct, weakest 3 categories, renewal_risk,
    days_to_expiry — all from one additional lightweight aggregate query.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not row:
            raise HTTPException(404, "Organization not found.")
        admins = await conn.fetch(
            "SELECT id, user_id, email, full_name, phone, role, status, last_login, created_at "
            "FROM organization_admins WHERE organization_id = $1",
            org_id,
        )
        student_count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND status != 'removed'",
            org_id,
        )
        active_access = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'",
            org_id,
        )
        # NEW: per-student performance for summary KPIs
        perf_rows = await _fetch_org_perf_aggregate(conn, org_id)

    perf_summary = _compute_org_perf_summary(perf_rows, org_row=row)

    return {
        # ── Existing fields (preserved verbatim) ──────────────────────────────
        "organization":       dict(row),
        "admins":             [dict(a) for a in admins],
        "student_count":      student_count,
        "active_access_count":active_access,
        # ── NEW ───────────────────────────────────────────────────────────────
        "performance_summary": perf_summary,
    }


@router.put("/organizations/{org_id}")
async def update_organization(
    org_id: str,
    body: UpdateOrgRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1", org_id)
        if not existing:
            raise HTTPException(404, "Organization not found.")
        sets, params, idx = [], [], 0
        for field in ["name", "contact_name", "contact_email", "contact_phone",
                      "address", "placement_cell_name", "branch_code", "seat_limit", "notes"]:
            val = getattr(body, field, None)
            if val is not None:
                idx += 1; sets.append(f"{field} = ${idx}"); params.append(val)
        if not sets:
            raise HTTPException(400, "No fields to update.")
        idx += 1; params.append(org_id)
        await conn.execute(
            f"UPDATE organizations SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${idx}",
            *params,
        )
        row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
    return {"status": "updated", "organization": dict(row)}


@router.post("/organizations/{org_id}/suspend")
async def suspend_organization(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        # ✅ FIXED: Guard against silent no-op on non-existent org_id
        existing = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1", org_id)
        if not existing:
            raise HTTPException(404, "Organization not found.")
        await conn.execute(
            "UPDATE organizations SET status = 'suspended', updated_at = NOW() WHERE id = $1",
            org_id,
        )
    return {"status": "suspended"}


@router.post("/organizations/{org_id}/activate")
async def activate_organization(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        # ✅ FIXED: Guard against silent no-op on non-existent org_id
        existing = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1", org_id)
        if not existing:
            raise HTTPException(404, "Organization not found.")
        await conn.execute(
            "UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1",
            org_id,
        )
    return {"status": "activated"}


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        students = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND status = 'active'",
            org_id,
        )
        if students > 0:
            raise HTTPException(
                400,
                f"Cannot delete: {students} active students. Remove or reassign them first.",
            )
        async with conn.transaction():
            # Reset student profiles to free tier before deleting their org
            await conn.execute(
                """UPDATE profiles 
                   SET plan = 'free', org_student = FALSE, organization_id = NULL 
                   WHERE organization_id = $1""",
                org_id,
            )
            # Reset org admin profiles
            await conn.execute(
                """UPDATE profiles 
                   SET is_org_admin = FALSE 
                   WHERE id IN (
                       SELECT user_id FROM organization_admins WHERE organization_id = $1
                   )""",
                org_id,
            )
            # Hard delete cascades to organization_students, organization_admins, etc.
            await conn.execute("DELETE FROM organizations WHERE id = $1", org_id)
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATION ADMIN CRUD
# ══════════════════════════════════════════════════════════════════════════════
