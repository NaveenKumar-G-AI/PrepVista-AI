"""
PrepVista AI - Super Admin Users
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin

from app.routers.org_admin_schemas import CreateOrgAdminRequest, UpdateOrgAdminRequest
from app.routers.org_admin_helpers import (
    ORG_DEFAULT_PAGE_SIZE,
    _paginate,
    _validate_uuid,
)

router = APIRouter()
@router.post("/admins")
async def create_org_admin(
    body: CreateOrgAdminRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Create a college admin user.

    ✅ FIXED: Both writes (INSERT organization_admins + UPDATE profiles) now inside
    a transaction. Previously no transaction — if UPDATE profiles failed, the admin
    row existed in organization_admins but the profile was never flagged is_org_admin,
    leaving the account in a broken half-admin state.
    """
    _validate_uuid(body.organization_id, "organization ID")
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            org = await conn.fetchrow("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", body.organization_id)
            if not org:
                raise HTTPException(404, "Organization not found.")
            profiles = await conn.fetch(
                "SELECT id FROM profiles WHERE LOWER(email) = LOWER($1) ORDER BY id FOR UPDATE", body.email.strip(),
            )
            if len(profiles) != 1:
                raise HTTPException(409 if profiles else 404, "An unambiguous existing PrepVista account is required.")
            user_id = str(profiles[0]["id"])
            conflict = await conn.fetchval(
                """SELECT 1 FROM organization_admins WHERE user_id = $1
                   AND organization_id != $2 AND status = 'active'
                   UNION ALL SELECT 1 FROM organization_students WHERE user_id = $1
                   AND organization_id != $2 AND status != 'removed'""", user_id, body.organization_id,
            )
            if conflict:
                raise HTTPException(409, "User already has a role in another organization.")
            existing = await conn.fetchrow(
                "SELECT * FROM organization_admins WHERE organization_id = $1 AND user_id = $2 FOR UPDATE",
                body.organization_id, user_id,
            )
            if existing:
                # Creation retries must not reactivate a subsequently disabled admin.
                return {"status": "already_assigned", "admin": dict(existing)}
            row = await conn.fetchrow(
                """INSERT INTO organization_admins (organization_id, user_id, email, full_name, phone)
                   VALUES ($1, $2, $3, $4, $5) RETURNING *""",
                body.organization_id, user_id, body.email.strip().lower(), body.full_name, body.phone,
            )
            await conn.execute(
                "UPDATE profiles SET is_org_admin = TRUE, organization_id = $1 WHERE id = $2",
                body.organization_id, user_id,
            )
    return {"status": "created", "admin": dict(row)}


@router.get("/admins")
async def list_org_admins(
    organization_id: str | None = None,
    page: int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: UserProfile = Depends(require_main_admin()),
):
    """List org admins with pagination.

    ✅ FIXED: Added `total` to response — previously missing, making frontend
    pagination controls impossible to render correctly.
    """
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        where, params, idx = [], [], 0
        if organization_id:
            idx += 1; where.append(f"oa.organization_id = ${idx}"); params.append(organization_id)
        w = ("WHERE " + " AND ".join(where)) if where else ""
        # ✅ FIXED: total now included
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM organization_admins oa {w}", *params
        )
        rows = await conn.fetch(
            f"""SELECT oa.*, o.name AS organization_name, o.org_code
                FROM organization_admins oa
                JOIN organizations o ON o.id = oa.organization_id
                {w} ORDER BY oa.created_at DESC LIMIT ${idx+1}::int OFFSET ${idx+2}::int""",
            *params, ps, offset,
        )
    return {"admins": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.get("/admins/{admin_id}")
async def get_org_admin_detail(
    admin_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(admin_id, "admin ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT oa.*, o.name AS organization_name, o.org_code
               FROM organization_admins oa
               JOIN organizations o ON o.id = oa.organization_id
               WHERE oa.id = $1""",
            admin_id,
        )
        if not row:
            raise HTTPException(404, "Organization admin not found.")
    return {"admin": dict(row)}


@router.put("/admins/{admin_id}")
async def update_org_admin(
    admin_id: str,
    body: UpdateOrgAdminRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(admin_id, "admin ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        sets, params, idx = [], [], 0
        if body.full_name is not None:
            idx += 1; sets.append(f"full_name = ${idx}"); params.append(body.full_name)
        if body.phone is not None:
            idx += 1; sets.append(f"phone = ${idx}"); params.append(body.phone)
        if not sets:
            raise HTTPException(400, "No fields to update.")
        idx += 1; params.append(admin_id)
        await conn.execute(
            f"UPDATE organization_admins SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${idx}",
            *params,
        )
    return {"status": "updated"}


async def _set_admin_status(admin_id: str, enabled: bool):
    _validate_uuid(admin_id, "admin ID")
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT * FROM organization_admins WHERE id = $1", admin_id)
            if not row:
                raise HTTPException(404, "Organization admin not found.")
            await conn.fetchval("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", row["organization_id"])
            await conn.fetchval("SELECT id FROM profiles WHERE id = $1 FOR UPDATE", row["user_id"])
            row = await conn.fetchrow("SELECT * FROM organization_admins WHERE id = $1 FOR UPDATE", admin_id)
            if enabled:
                conflict = await conn.fetchval(
                    """SELECT 1 FROM organization_admins WHERE user_id = $1
                       AND organization_id != $2 AND status = 'active'
                       UNION ALL SELECT 1 FROM organization_students WHERE user_id = $1
                       AND organization_id != $2 AND status != 'removed'""", row["user_id"], row["organization_id"],
                )
                if conflict:
                    raise HTTPException(409, "User already administers another organization.")
            await conn.execute(
                "UPDATE organization_admins SET status = $1, updated_at = NOW() WHERE id = $2",
                "active" if enabled else "suspended", admin_id,
            )
            await conn.execute(
                """UPDATE profiles SET is_org_admin = EXISTS(
                     SELECT 1 FROM organization_admins oa WHERE oa.user_id = profiles.id AND oa.status = 'active')
                   WHERE id = $1""", row["user_id"],
            )
    return {"status": "enabled" if enabled else "disabled"}


@router.post("/admins/{admin_id}/disable")
async def disable_org_admin(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    return await _set_admin_status(admin_id, False)


@router.post("/admins/{admin_id}/enable")
async def enable_org_admin(admin_id: str, admin: UserProfile = Depends(require_main_admin())):
    return await _set_admin_status(admin_id, True)


@router.post("/admins/{admin_id}/reset-password")
async def reset_org_admin_password(
    admin_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(admin_id, "admin ID")   # ✅ SEC
    return {
        "status":  "password_reset_initiated",
        "message": "Admin should use the login page 'Forgot Password' flow.",
    }


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ADMIN: COLLEGE DATA VIEWS  (fixed + extended)
# ══════════════════════════════════════════════════════════════════════════════
