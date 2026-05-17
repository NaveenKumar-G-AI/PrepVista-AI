"""
PrepVista — Organization Admin Router (Main Admin)
Platform admin endpoints for managing colleges, college admins, and oversight.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from app.config import (
    COLLEGE_STUDENT_PLAN, ORG_DEFAULT_PAGE_SIZE, ORG_MAX_PAGE_SIZE,
    generate_org_code, get_org_category_config,
)
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin

router = APIRouter()


# ── Request Models ───────────────────────────────────
class CreateOrgRequest(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    placement_cell_name: str | None = None
    branch_code: str | None = None
    seat_limit: int = 50
    notes: str | None = None


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    placement_cell_name: str | None = None
    branch_code: str | None = None
    seat_limit: int | None = None
    notes: str | None = None


class CreateOrgAdminRequest(BaseModel):
    organization_id: str
    email: str
    full_name: str | None = None
    phone: str | None = None


class UpdateOrgAdminRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class AssignPlanRequest(BaseModel):
    plan: str = "college_standard"
    seat_limit: int = 50
    billing_type: str = "annual"
    amount_paise: int | None = None
    end_date: str | None = None


# ── Helper ───────────────────────────────────────────
def _paginate(page: int, page_size: int) -> tuple[int, int]:
    ps = min(max(1, page_size), ORG_MAX_PAGE_SIZE)
    offset = max(0, (max(1, page) - 1) * ps)
    return ps, offset


# ── Organization CRUD ────────────────────────────────
@router.post("/organizations")
async def create_organization(
    body: CreateOrgRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    async with DatabaseConnection() as conn:
        seq = await conn.fetchval("SELECT COALESCE(MAX(CAST(SUBSTRING(org_code FROM 5) AS INT)), 0) + 1 FROM organizations")
        org_code = generate_org_code(seq, "college")
        cfg = get_org_category_config("college")
        row = await conn.fetchrow(
            """INSERT INTO organizations
               (name, category, org_code, contact_name, contact_email, contact_phone,
                address, placement_cell_name, branch_code, plan, seat_limit, notes, created_by_admin_id)
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
    page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        where, params = ["category = 'college'"], []
        idx = 0
        if status:
            idx += 1; where.append(f"status = ${idx}"); params.append(status)
        if search:
            idx += 1; where.append(f"(LOWER(name) LIKE ${idx} OR org_code LIKE ${idx})")
            params.append(f"%{search.lower()}%")
        w = " AND ".join(where)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM organizations WHERE {w}", *params)
        rows = await conn.fetch(
            f"SELECT * FROM organizations WHERE {w} ORDER BY created_at DESC LIMIT ${idx+1}::int OFFSET ${idx+2}::int",
            *params, ps, offset,
        )
    return {"organizations": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.get("/organizations/{org_id}")
async def get_organization(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not row:
            raise HTTPException(404, "Organization not found.")
        admins = await conn.fetch(
            "SELECT id, user_id, email, full_name, phone, role, status, last_login, created_at FROM organization_admins WHERE organization_id = $1",
            org_id,
        )
        student_count = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status != 'removed'", org_id)
        active_access = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'", org_id)
    return {
        "organization": dict(row),
        "admins": [dict(a) for a in admins],
        "student_count": student_count,
        "active_access_count": active_access,
    }


@router.put("/organizations/{org_id}")
async def update_organization(org_id: str, body: UpdateOrgRequest, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1", org_id)
        if not existing:
            raise HTTPException(404, "Organization not found.")
        sets, params, idx = [], [], 0
        for field in ["name","contact_name","contact_email","contact_phone","address","placement_cell_name","branch_code","seat_limit","notes"]:
            val = getattr(body, field, None)
            if val is not None:
                idx += 1; sets.append(f"{field} = ${idx}"); params.append(val)
        if not sets:
            raise HTTPException(400, "No fields to update.")
        idx += 1; params.append(org_id)
        await conn.execute(f"UPDATE organizations SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${idx}", *params)
        row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
    return {"status": "updated", "organization": dict(row)}


@router.post("/organizations/{org_id}/suspend")
async def suspend_organization(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE organizations SET status = 'suspended', updated_at = NOW() WHERE id = $1", org_id)
    return {"status": "suspended"}


@router.post("/organizations/{org_id}/activate")
async def activate_organization(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1", org_id)
    return {"status": "activated"}


@router.delete("/organizations/{org_id}")
async def delete_organization(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        students = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status = 'active'", org_id)
        if students > 0:
            raise HTTPException(400, f"Cannot delete: {students} active students. Remove or reassign them first.")
        await conn.execute("DELETE FROM organizations WHERE id = $1", org_id)
    return {"status": "deleted"}


# ── Organization Admin CRUD ──────────────────────────
@router.post("/admins")
async def create_org_admin(body: CreateOrgAdminRequest, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1", body.organization_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        profile = await conn.fetchrow("SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)", body.email)
        if not profile:
            raise HTTPException(404, f"No PrepVista account found for {body.email}. User must sign up first.")
        existing = await conn.fetchrow("SELECT id FROM organization_admins WHERE organization_id = $1 AND user_id = $2", body.organization_id, str(profile["id"]))
        if existing:
            raise HTTPException(400, "This user is already an admin for this organization.")
        row = await conn.fetchrow(
            """INSERT INTO organization_admins (organization_id, user_id, email, full_name, phone)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            body.organization_id, str(profile["id"]), body.email, body.full_name, body.phone,
        )
        await conn.execute("UPDATE profiles SET is_org_admin = TRUE, organization_id = $1 WHERE id = $2", body.organization_id, str(profile["id"]))
    return {"status": "created", "admin": dict(row)}


@router.get("/admins")
async def list_org_admins(
    organization_id: str | None = None,
    page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        where, params, idx = [], [], 0
        if organization_id:
            idx += 1; where.append(f"oa.organization_id = ${idx}"); params.append(organization_id)
        w = ("WHERE " + " AND ".join(where)) if where else ""
        rows = await conn.fetch(
            f"""SELECT oa.*, o.name AS organization_name, o.org_code
                FROM organization_admins oa JOIN organizations o ON o.id = oa.organization_id
                {w} ORDER BY oa.created_at DESC LIMIT ${idx+1}::int OFFSET ${idx+2}::int""",
            *params, ps, offset,
        )
    return {"admins": [dict(r) for r in rows]}


@router.get("/admins/{admin_id}")
async def get_org_admin_detail(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT oa.*, o.name AS organization_name, o.org_code
               FROM organization_admins oa JOIN organizations o ON o.id = oa.organization_id
               WHERE oa.id = $1""", admin_id,
        )
        if not row:
            raise HTTPException(404, "Organization admin not found.")
    return {"admin": dict(row)}


@router.put("/admins/{admin_id}")
async def update_org_admin(admin_id: str, body: UpdateOrgAdminRequest, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        sets, params, idx = [], [], 0
        if body.full_name is not None:
            idx += 1; sets.append(f"full_name = ${idx}"); params.append(body.full_name)
        if body.phone is not None:
            idx += 1; sets.append(f"phone = ${idx}"); params.append(body.phone)
        if not sets:
            raise HTTPException(400, "No fields to update.")
        idx += 1; params.append(admin_id)
        await conn.execute(f"UPDATE organization_admins SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${idx}", *params)
    return {"status": "updated"}


@router.post("/admins/{admin_id}/disable")
async def disable_org_admin(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE organization_admins SET status = 'suspended', updated_at = NOW() WHERE id = $1", admin_id)
    return {"status": "disabled"}


@router.post("/admins/{admin_id}/enable")
async def enable_org_admin(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE organization_admins SET status = 'active', updated_at = NOW() WHERE id = $1", admin_id)
    return {"status": "enabled"}


@router.post("/admins/{admin_id}/reset-password")
async def reset_org_admin_password(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    return {"status": "password_reset_initiated", "message": "Admin should use the login page 'Forgot Password' flow."}


# ── Main Admin: View College Data ────────────────────
@router.get("/organizations/{org_id}/students")
async def get_org_students_admin(
    org_id: str,
    page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT os.*, p.email, p.full_name, p.plan,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years cy ON cy.id = os.year_id
               LEFT JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.organization_id = $1 AND os.status != 'removed'
               ORDER BY os.added_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset,
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status != 'removed'", org_id)
    return {"students": [dict(r) for r in rows], "total": total}


@router.get("/organizations/{org_id}/analytics")
async def get_org_analytics_admin(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        total = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status = 'active'", org_id)
        access = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'", org_id)
        dept_stats = await conn.fetch(
            """SELECT cd.department_name, COUNT(os.id) as total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) as with_access
               FROM organization_students os
               JOIN college_departments cd ON cd.id = os.department_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cd.department_name ORDER BY total DESC""", org_id,
        )
        year_stats = await conn.fetch(
            """SELECT cy.year_name, COUNT(os.id) as total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) as with_access
               FROM organization_students os
               JOIN college_years cy ON cy.id = os.year_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cy.year_name ORDER BY total DESC""", org_id,
        )
    return {
        "organization": dict(org),
        "total_students": total, "career_access_students": access,
        "department_stats": [dict(d) for d in dept_stats],
        "year_stats": [dict(y) for y in year_stats],
    }


@router.get("/organizations/{org_id}/access-log")
async def get_org_access_log_admin(
    org_id: str, page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
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
    return {"access_log": [dict(r) for r in rows]}


@router.post("/organizations/{org_id}/assign-plan")
async def assign_org_plan(org_id: str, body: AssignPlanRequest, admin: UserProfile = Depends(require_main_admin())):
    """Assign a plan to a college and optionally grant career access to all active students."""
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        await conn.execute(
            "UPDATE organizations SET plan = $1, seat_limit = $2, updated_at = NOW() WHERE id = $3",
            body.plan, body.seat_limit, org_id,
        )
        await conn.execute(
            """INSERT INTO org_plan_allocations (organization_id, plan, seat_limit, billing_type, amount_paise, end_date)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            org_id, body.plan, body.seat_limit, body.billing_type,
            body.amount_paise, body.end_date,
        )

        # Grant career access to all active students who don't already have it
        now = datetime.now(timezone.utc)
        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = FALSE""",
            org_id,
        )
        granted = 0
        for student in students:
            user_id = str(student["user_id"])
            await conn.execute(
                """UPDATE organization_students
                   SET has_career_access = TRUE, access_granted_at = $1, access_granted_by = $2, updated_at = $1
                   WHERE id = $3""",
                now, admin.id, student["id"],
            )
            await conn.execute(
                "UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                COLLEGE_STUDENT_PLAN, org_id, user_id,
            )
            granted += 1

    return {
        "status": "plan_assigned",
        "students_granted": granted,
        "message": f"Plan assigned to {org['name']}. Career access granted to {granted} students.",
    }


class RecordPaymentRequest(BaseModel):
    amount_paise: int
    plan: str = "college_standard"
    billing_type: str = "annual"
    seat_count: int | None = None
    notes: str | None = None


@router.post("/organizations/{org_id}/record-payment")
async def record_org_payment(org_id: str, body: RecordPaymentRequest, admin: UserProfile = Depends(require_main_admin())):
    """Record a manual/offline payment for a college (bank transfer, cheque, etc.)."""
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        now = datetime.now(timezone.utc)
        payment = await conn.fetchrow(
            """INSERT INTO org_payments
               (organization_id, provider, plan, amount_paise, currency, status,
                seat_count, notes, created_at, verified_at)
               VALUES ($1, 'manual', $2, $3, 'INR', 'verified', $4, $5, $6, $6)
               RETURNING id""",
            org_id, body.plan, body.amount_paise,
            body.seat_count, body.notes or f"Manual payment recorded by admin", now,
        )

    return {
        "status": "recorded",
        "payment_id": str(payment["id"]),
        "message": f"Payment of ₹{body.amount_paise / 100:.2f} recorded for {org['name']}.",
    }


@router.post("/organizations/{org_id}/revoke-plan")
async def revoke_org_plan(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    """Revoke a college's plan and remove career access from all active students."""
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        # Revoke career access from all students
        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = TRUE""",
            org_id,
        )
        revoked = 0
        for student in students:
            user_id = str(student["user_id"])
            await conn.execute(
                "UPDATE organization_students SET has_career_access = FALSE, updated_at = NOW() WHERE id = $1",
                student["id"],
            )
            await conn.execute(
                "UPDATE profiles SET plan = 'free' WHERE id = $1",
                user_id,
            )
            revoked += 1

        # Reset org plan to default
        await conn.execute(
            "UPDATE organizations SET plan = 'college_standard', updated_at = NOW() WHERE id = $1",
            org_id,
        )

        # Record allocation as expired
        await conn.execute(
            """UPDATE org_plan_allocations SET status = 'expired', updated_at = NOW()
               WHERE organization_id = $1 AND status = 'active'""",
            org_id,
        )

    return {
        "status": "revoked",
        "students_revoked": revoked,
        "message": f"Plan revoked for {org['name']}. Career access removed from {revoked} students.",
    }


@router.post("/organizations/{org_id}/grant-all-access")
async def grant_all_org_access(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    """Grant career access to ALL active students in the org who don't have it yet."""
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        now = datetime.now(timezone.utc)
        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = FALSE""",
            org_id,
        )
        granted = 0
        for student in students:
            user_id = str(student["user_id"])
            await conn.execute(
                """UPDATE organization_students
                   SET has_career_access = TRUE, access_granted_at = $1, access_granted_by = $2, updated_at = $1
                   WHERE id = $3""",
                now, admin.id, student["id"],
            )
            await conn.execute(
                "UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                COLLEGE_STUDENT_PLAN, org_id, user_id,
            )
            granted += 1

    return {
        "status": "granted",
        "students_granted": granted,
        "message": f"Career access granted to {granted} students in {org['name']}.",
    }


@router.post("/organizations/{org_id}/revoke-all-access")
async def revoke_all_org_access(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    """Revoke career access from ALL active students in the org."""
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = TRUE""",
            org_id,
        )
        revoked = 0
        for student in students:
            user_id = str(student["user_id"])
            await conn.execute(
                "UPDATE organization_students SET has_career_access = FALSE, updated_at = NOW() WHERE id = $1",
                student["id"],
            )
            await conn.execute(
                "UPDATE profiles SET plan = 'free' WHERE id = $1",
                user_id,
            )
            revoked += 1

    return {
        "status": "revoked",
        "students_revoked": revoked,
        "message": f"Career access revoked from {revoked} students in {org['name']}.",
    }


@router.get("/organizations/{org_id}/billing")
async def get_org_billing_admin(org_id: str, admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        allocations = await conn.fetch("SELECT * FROM org_plan_allocations WHERE organization_id = $1 ORDER BY created_at DESC", org_id)
        payments = await conn.fetch("SELECT * FROM org_payments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50", org_id)
        total_students = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status = 'active'", org_id)
        access_count = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'", org_id)
    return {
        "organization": dict(org),
        "allocations": [dict(a) for a in allocations],
        "payments": [dict(p) for p in payments],
        "total_students": total_students,
        "career_access_count": access_count,
    }


@router.get("/dashboard")
async def org_admin_dashboard(admin: UserProfile = Depends(require_main_admin())):
    async with DatabaseConnection() as conn:
        total_orgs = await conn.fetchval("SELECT COUNT(*) FROM organizations WHERE category = 'college'")
        active_orgs = await conn.fetchval("SELECT COUNT(*) FROM organizations WHERE category = 'college' AND status = 'active'")
        total_students = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE status = 'active'")
        total_access = await conn.fetchval("SELECT COUNT(*) FROM organization_students WHERE has_career_access = TRUE AND status = 'active'")
        recent_orgs = await conn.fetch("SELECT id, name, org_code, status, seat_limit, seats_used, created_at FROM organizations ORDER BY created_at DESC LIMIT 10")
    return {
        "total_organizations": total_orgs,
        "active_organizations": active_orgs,
        "total_students": total_students,
        "total_career_access": total_access,
        "recent_organizations": [dict(r) for r in recent_orgs],
    }

