"""
PrepVista AI - Org College Students
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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.config import (
    COLLEGE_STUDENT_PLAN, ORG_DEFAULT_PAGE_SIZE, ORG_MAX_PAGE_SIZE,
)
from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

from app.routers.org_college_schemas import AddStudentRequest, UpdateStudentRequest
from app.routers.org_college_helpers import _paginate, _MAX_SEARCH_LEN, _validate_uuid, _log_action

router = APIRouter()

@router.get("/students")
async def list_students(
    search:        str | None = None,
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    has_access:    bool | None = None,
    page:      int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    ps, offset = _paginate(page, page_size)
    org_id     = admin.organization_id
    # ✅ SEC: Cap search length before it reaches the DB.
    safe_search = (search or "")[:_MAX_SEARCH_LEN].strip() or None
    async with DatabaseConnection() as conn:
        where  = ["os.organization_id = $1", "os.status != 'removed'"]
        params: list = [org_id]
        idx = 1
        if safe_search:
            idx += 1
            where.append(
                f"(LOWER(p.email) LIKE ${idx} OR LOWER(p.full_name) LIKE ${idx} OR os.student_code LIKE ${idx})"
            )
            params.append(f"%{safe_search.lower()}%")
        if department_id:
            idx += 1; where.append(f"os.department_id = ${idx}"); params.append(department_id)
        if year_id:
            idx += 1; where.append(f"os.year_id = ${idx}");       params.append(year_id)
        if batch_id:
            idx += 1; where.append(f"os.batch_id = ${idx}");      params.append(batch_id)
        if has_access is not None:
            idx += 1; where.append(f"os.has_career_access = ${idx}"); params.append(has_access)
        w = " AND ".join(where)
        total = await conn.fetchval(
            f"""SELECT COUNT(*) FROM organization_students os
                JOIN profiles p ON p.id = os.user_id WHERE {w}""",
            *params,
        )
        rows = await conn.fetch(
            f"""SELECT os.*, p.email, p.full_name, p.plan,
                       cd.department_name, cy.year_name, cb.batch_name
                FROM organization_students os
                JOIN profiles p ON p.id = os.user_id
                LEFT JOIN college_departments cd ON cd.id = os.department_id
                LEFT JOIN college_years       cy ON cy.id = os.year_id
                LEFT JOIN college_batches     cb ON cb.id = os.batch_id
                WHERE {w} ORDER BY os.added_at DESC LIMIT ${idx+1} OFFSET ${idx+2}""",
            *params, ps, offset,
        )
    return {"students": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.post("/students")
async def add_student(
    body: AddStudentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow(
            "SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id
        )
        if org and org["seats_used"] >= org["seat_limit"]:
            raise HTTPException(
                400,
                f"Seat limit reached ({org['seat_limit']}). Contact your platform admin to increase seats.",
            )
        profile = await conn.fetchrow(
            "SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)", body.email
        )
        if not profile:
            raise HTTPException(
                404, f"No PrepVista account found for {body.email}. Student must sign up first."
            )
        user_id  = str(profile["id"])
        existing = await conn.fetchrow(
            "SELECT id FROM organization_students WHERE organization_id = $1 AND user_id = $2",
            org_id, user_id,
        )
        if existing:
            raise HTTPException(400, "This student is already in your organization.")
        access_at = datetime.now(timezone.utc) if body.grant_career_access else None
        # ✅ FIXED: All 3 writes inside a transaction. Previously no transaction —
        # seat count and plan could be left inconsistent on any mid-write failure.
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO organization_students
                   (organization_id, user_id, student_code, department_id, year_id, batch_id,
                    section, has_career_access, access_granted_at, access_granted_by, notes)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
                org_id, user_id, body.student_code, body.department_id, body.year_id,
                body.batch_id, body.section, body.grant_career_access, access_at,
                admin.user_id if body.grant_career_access else None, body.notes,
            )
            await conn.execute(
                "UPDATE organizations SET seats_used = seats_used + 1 WHERE id = $1", org_id
            )
            if body.grant_career_access:
                await conn.execute(
                    "UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                    COLLEGE_STUDENT_PLAN, org_id, user_id,
                )
            else:
                await conn.execute(
                    "UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2",
                    org_id, user_id,
                )
        await _log_action(
            conn, org_id, admin.user_id, "add_student",
            student_id=user_id, notes=f"Added {body.email}",
        )
    return {"status": "added", "student": dict(row)}


@router.get("/students/{student_id}")
async def get_student(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(student_id, "student ID")
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT os.*, p.email, p.full_name, p.plan,
                      cd.department_name, cy.year_name, cb.batch_name
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN college_departments cd ON cd.id = os.department_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id
               WHERE os.id = $1 AND os.organization_id = $2""",
            student_id, admin.organization_id,
        )
        if not row:
            raise HTTPException(404, "Student not found in your organization.")
    return {"student": dict(row)}


@router.put("/students/{student_id}")
async def update_student(
    student_id: str,
    body: UpdateStudentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id, user_id FROM organization_students WHERE id = $1 AND organization_id = $2",
            student_id, org_id,
        )
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
            *params,
        )
        await _log_action(
            conn, org_id, admin.user_id, "edit_student",
            student_id=str(existing["user_id"]), notes="Updated student info",
        )
    return {"status": "updated"}


@router.delete("/students/{student_id}")
async def remove_student(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2",
            student_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Student not found in your organization.")
        user_id = str(row["user_id"])
        # ✅ FIXED: All 3 writes in a transaction. Previously no transaction —
        # seats_used decrement or profiles revert could fail leaving data inconsistent.
        async with conn.transaction():
            await conn.execute(
                "UPDATE organization_students SET status = 'removed', has_career_access = FALSE, updated_at = NOW() WHERE id = $1",
                student_id,
            )
            await conn.execute(
                "UPDATE organizations SET seats_used = GREATEST(seats_used - 1, 0) WHERE id = $1",
                org_id,
            )
            if row["has_career_access"]:
                await conn.execute(
                    "UPDATE profiles SET plan = 'free', org_student = FALSE, organization_id = NULL WHERE id = $1",
                    user_id,
                )
            else:
                await conn.execute(
                    "UPDATE profiles SET org_student = FALSE, organization_id = NULL WHERE id = $1",
                    user_id,
                )
        await _log_action(conn, org_id, admin.user_id, "remove_student", student_id=user_id)
    return {"status": "removed"}


# ══════════════════════════════════════════════════════════════════════════════
# GRANT / REVOKE CAREER ACCESS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/students/{student_id}/grant-access")
async def grant_career_access(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2 AND status = 'active'",
            student_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Active student not found.")
        if row["has_career_access"]:
            return {"status": "already_granted"}
        user_id = str(row["user_id"])
        now     = datetime.now(timezone.utc)
        # ✅ FIXED: Both writes inside a transaction — prevents split state where
        # student shows as granted but plan was never upgraded.
        async with conn.transaction():
            await conn.execute(
                """UPDATE organization_students
                   SET has_career_access = TRUE, access_granted_at = $1,
                       access_granted_by = $2, updated_at = $1
                   WHERE id = $3""",
                now, admin.user_id, student_id,
            )
            await conn.execute(
                "UPDATE profiles SET plan = $1 WHERE id = $2", COLLEGE_STUDENT_PLAN, user_id
            )
        await _log_action(conn, org_id, admin.user_id, "grant_access", student_id=user_id)
    return {"status": "granted"}


@router.post("/students/{student_id}/revoke-access")
async def revoke_career_access(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, has_career_access FROM organization_students WHERE id = $1 AND organization_id = $2 AND status = 'active'",
            student_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Active student not found.")
        if not row["has_career_access"]:
            return {"status": "already_revoked"}
        user_id = str(row["user_id"])
        # ✅ FIXED: Both writes inside a transaction — prevents split state where
        # access shows revoked but student's plan stayed upgraded.
        async with conn.transaction():
            await conn.execute(
                "UPDATE organization_students SET has_career_access = FALSE, updated_at = NOW() WHERE id = $1",
                student_id,
            )
            await conn.execute("UPDATE profiles SET plan = 'free' WHERE id = $1", user_id)
        await _log_action(conn, org_id, admin.user_id, "revoke_access", student_id=user_id)
    return {"status": "revoked"}


# ══════════════════════════════════════════════════════════════════════════════
# DEPARTMENT CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/students/bulk")
async def bulk_upload_students(
    file: UploadFile = File(...),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """CSV bulk upload.

    Required columns: full_name, student_id, email, phone, department, year,
    batch, section, notes, grant_career_access.

    ✅ FIXED N+1: Previously 2 DB calls per CSV row (profile lookup + enrollment
    check) = 2 × N queries. For 500 rows that's 1000 sequential DB calls which
    times out under any real load. Fixed with 2 bulk pre-fetches covering all
    emails, resolving all rows in Python with zero per-row DB calls.
    ✅ FIXED: Added 5 MB file size cap (previously unbounded — 100 MB CSV = OOM).
    ✅ FIXED: Added MIME type validation (previously any file type accepted).
    ✅ FIXED: All per-row writes inside a single transaction (atomic bulk import).
    """
    org_id = admin.organization_id
    from app.config import COLLEGE_CSV_MAX_ROWS, COLLEGE_CSV_REQUIRED_COLUMNS

    # ✅ SEC: MIME type validation
    _allowed_mime = {"text/csv", "text/plain", "application/csv", "application/octet-stream"}
    if file.content_type and file.content_type.split(";")[0].strip().lower() not in _allowed_mime:
        raise HTTPException(
            400, f"Invalid file type '{file.content_type}'. Please upload a CSV file."
        )

    # ✅ FIXED: 5 MB cap — previously unbounded
    _MAX_UPLOAD_BYTES = 5 * 1024 * 1024
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
        org = await conn.fetchrow(
            "SELECT seat_limit, seats_used FROM organizations WHERE id = $1", org_id
        )
        available = (org["seat_limit"] - org["seats_used"]) if org else 0

        # Pre-load segment maps: name → id (case-insensitive)
        depts = {r["department_name"].lower(): str(r["id"]) for r in await conn.fetch(
            "SELECT id, department_name FROM college_departments WHERE organization_id = $1", org_id)}
        yrs   = {r["year_name"].lower():       str(r["id"]) for r in await conn.fetch(
            "SELECT id, year_name FROM college_years WHERE organization_id = $1", org_id)}
        bats  = {r["batch_name"].lower():      str(r["id"]) for r in await conn.fetch(
            "SELECT id, batch_name FROM college_batches WHERE organization_id = $1", org_id)}

        # ✅ N+1 FIX: Bulk fetch ALL profiles and enrolled users in 2 queries
        all_emails = [
            (row.get("email") or "").strip().lower()
            for row in rows
            if (row.get("email") or "").strip()
        ]
        profile_rows = await conn.fetch(
            "SELECT id, email FROM profiles WHERE LOWER(email) = ANY($1::text[])",
            all_emails,
        )
        email_to_user_id: dict[str, str] = {
            r["email"].lower(): str(r["id"]) for r in profile_rows
        }
        enrolled_rows = await conn.fetch(
            """SELECT user_id FROM organization_students
               WHERE organization_id = $1 AND user_id = ANY($2::uuid[])""",
            org_id,
            list(email_to_user_id.values()),
        )
        already_enrolled: set[str] = {str(r["user_id"]) for r in enrolled_rows}

        success, failed, granted = 0, [], 0
        async with conn.transaction():
            for i, row in enumerate(rows, 1):
                email  = (row.get("email") or "").strip()
                errors: list[str] = []
                if not email:
                    errors.append("Missing email")
                student_id_val = (row.get("student_id") or "").strip()
                dept_name  = (row.get("department") or "").strip().lower()
                year_name  = (row.get("year")       or "").strip().lower()
                batch_name = (row.get("batch")      or "").strip().lower()
                if not student_id_val:
                    errors.append("Missing student ID")
                if not dept_name:
                    errors.append("Missing department")
                if not batch_name:
                    errors.append("Missing batch")
                dept_id  = depts.get(dept_name)
                year_id  = yrs.get(year_name)
                batch_id = bats.get(batch_name)
                if dept_name  and not dept_id:
                    errors.append(f"Department '{row.get('department', '')}' not found")
                if year_name  and not year_id:
                    errors.append(f"Year '{row.get('year', '')}' not found")
                if batch_name and not batch_id:
                    errors.append(f"Batch '{row.get('batch', '')}' not found")
                if errors:
                    failed.append({"row": i, "email": email, "errors": errors}); continue

                user_id = email_to_user_id.get(email.lower())
                if not user_id:
                    failed.append({"row": i, "email": email, "errors": ["No PrepVista account found"]}); continue
                if user_id in already_enrolled:
                    failed.append({"row": i, "email": email, "errors": ["Already in organization"]}); continue
                if available <= 0:
                    failed.append({"row": i, "email": email, "errors": ["Seat limit reached"]}); continue

                grant_str = (row.get("grant_career_access") or "").strip().lower()
                grant     = grant_str not in ("false", "no", "0")
                access_at = datetime.now(timezone.utc) if grant else None

                await conn.execute(
                    """INSERT INTO organization_students
                       (organization_id, user_id, student_code, department_id, year_id, batch_id,
                        section, has_career_access, access_granted_at, access_granted_by, notes)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                    org_id, user_id, student_id_val or None,
                    dept_id, year_id, batch_id,
                    (row.get("section") or "").strip() or None,
                    grant, access_at, admin.user_id if grant else None,
                    (row.get("notes") or "").strip() or None,
                )
                await conn.execute(
                    "UPDATE organizations SET seats_used = seats_used + 1 WHERE id = $1", org_id
                )
                if grant:
                    await conn.execute(
                        "UPDATE profiles SET plan = $1, org_student = TRUE, organization_id = $2 WHERE id = $3",
                        COLLEGE_STUDENT_PLAN, org_id, user_id,
                    )
                    granted += 1
                else:
                    await conn.execute(
                        "UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2",
                        org_id, user_id,
                    )
                already_enrolled.add(user_id)   # prevent duplicate rows in same CSV
                success  += 1
                available -= 1

        await _log_action(
            conn, org_id, admin.user_id, "bulk_add",
            metadata={"success": success, "failed": len(failed), "granted": granted},
        )

    return {
        "total_rows":            len(rows),
        "success":               success,
        "failed_count":          len(failed),
        "career_access_granted": granted,
        "failed_rows":           failed,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACCESS CONTROL
# ══════════════════════════════════════════════════════════════════════════════
