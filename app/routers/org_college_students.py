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
from app.services.score_semantics import org_measurement_rows
from app.dependencies import OrgAdminProfile, require_org_admin, invalidate_local_user_context

from app.routers.org_college_schemas import AddStudentRequest, UpdateStudentRequest
from app.routers.org_college_helpers import _paginate, _MAX_SEARCH_LEN, _validate_uuid, _log_action

router = APIRouter()

_STUDENT_SORT_COLUMNS = {
    "full_name": "LOWER(COALESCE(p.full_name, ''))",
    "added_at": "os.added_at",
    "department_name": "LOWER(COALESCE(cd.department_name, ''))",
}


async def _validate_student_segments(
    conn,
    organization_id: str,
    *,
    department_id: str | None,
    year_id: str | None,
    batch_id: str | None,
) -> None:
    """Ensure every enrollment segment belongs to the admin's organization.

    The foreign keys only guarantee that a UUID exists globally. Without these
    tenant checks an org admin could attach a student to another college's
    department/year/batch by submitting its UUID directly.
    """
    if department_id:
        valid_department = await conn.fetchval(
            """SELECT EXISTS(
                   SELECT 1 FROM college_departments
                   WHERE id = $1 AND organization_id = $2
               )""",
            department_id,
            organization_id,
        )
        if not valid_department:
            raise HTTPException(422, "Department does not belong to your organization.")

    if year_id:
        valid_year = await conn.fetchval(
            """SELECT EXISTS(
                   SELECT 1 FROM college_years
                   WHERE id = $1 AND organization_id = $2
               )""",
            year_id,
            organization_id,
        )
        if not valid_year:
            raise HTTPException(422, "Year does not belong to your organization.")

    if batch_id:
        batch = await conn.fetchrow(
            """SELECT year_id FROM college_batches
               WHERE id = $1 AND organization_id = $2""",
            batch_id,
            organization_id,
        )
        if not batch:
            raise HTTPException(422, "Batch does not belong to your organization.")
        if year_id and batch["year_id"] and str(batch["year_id"]) != str(year_id):
            raise HTTPException(422, "Selected batch does not belong to the selected year.")

@router.get("/students")
async def list_students(
    search:        str | None = None,
    department_id: str | None = None,
    year_id:       str | None = None,
    batch_id:      str | None = None,
    has_access:    bool | None = None,
    sort_by:       str = "added_at",
    sort_dir:      str = "desc",
    page:      int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    ps, offset = _paginate(page, page_size)
    org_id     = admin.organization_id
    # ✅ SEC: Cap search length before it reaches the DB.
    safe_search = (search or "")[:_MAX_SEARCH_LEN].strip() or None
    order_column = _STUDENT_SORT_COLUMNS.get(sort_by, _STUDENT_SORT_COLUMNS["added_at"])
    order_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
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
                LEFT JOIN college_departments cd ON cd.id = os.department_id AND cd.organization_id = os.organization_id
                LEFT JOIN college_years       cy ON cy.id = os.year_id AND cy.organization_id = os.organization_id
                LEFT JOIN college_batches     cb ON cb.id = os.batch_id AND cb.organization_id = os.organization_id
                WHERE {w}
                ORDER BY {order_column} {order_direction}, os.id ASC
                LIMIT ${idx+1} OFFSET ${idx+2}""",
            *params, ps, offset,
        )
        rows = await org_measurement_rows(conn, org_id, rows)
    return {"students": [dict(r) for r in rows], "total": total, "page": page, "page_size": ps}


@router.post("/students")
async def add_student(
    body: AddStudentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin(write=True)),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            # Serialize enrollment against this organization's allocation. The
            # database trigger is the only writer of organizations.seats_used.
            org = await conn.fetchrow(
                """SELECT seat_limit, seats_used FROM organizations
                   WHERE id = $1 FOR UPDATE""",
                org_id,
            )
            if not org:
                raise HTTPException(404, "Organization not found.")

            profiles = await conn.fetch(
                "SELECT id FROM profiles WHERE LOWER(email) = LOWER($1) ORDER BY id FOR UPDATE", body.email
            )
            if len(profiles) > 1:
                raise HTTPException(409, "Email identity is ambiguous. Contact support.")
            profile = profiles[0] if profiles else None
            if not profile:
                raise HTTPException(
                    404, f"No PrepVista account found for {body.email}. Student must sign up first."
                )
            user_id = str(profile["id"])
            if await conn.fetchval("SELECT 1 FROM organization_admins WHERE user_id = $1 AND organization_id != $2 AND status = 'active'", user_id, org_id):
                raise HTTPException(409, "User already administers another organization.")
            memberships = await conn.fetch(
                """SELECT * FROM organization_students
                   WHERE user_id = $1 AND status != 'removed'
                   ORDER BY added_at DESC FOR UPDATE""",
                user_id,
            )
            if any(str(r["organization_id"]) != str(org_id) for r in memberships):
                raise HTTPException(409, "This student already belongs to another organization.")
            existing = memberships[0] if memberships else None
            if existing:
                if str(existing["organization_id"]) == str(org_id):
                    if existing["status"] != "active":
                        raise HTTPException(409, "Membership is inactive. Reactivate it explicitly.")
                    fields = ("student_code", "department_id", "year_id", "batch_id", "section", "notes")
                    if any((str(existing[name]) if existing[name] is not None else None) != getattr(body, name)
                           for name in fields) or bool(existing["has_career_access"]) != body.grant_career_access:
                        raise HTTPException(409, "Student is already enrolled with different settings. Use student update.")
                    # A replay neither consumes another seat nor overwrites a later update.
                    projected = await org_measurement_rows(conn, org_id, [dict(existing)])
                    return {"status": "already_enrolled", "student": projected[0]}
                raise HTTPException(409, "This student already belongs to another organization.")

            if int(org["seats_used"] or 0) >= int(org["seat_limit"] or 0):
                raise HTTPException(
                    400,
                    f"Seat limit reached ({org['seat_limit']}). Contact your platform admin to increase seats.",
                )

            if body.student_code:
                code_in_use = await conn.fetchval(
                    """SELECT EXISTS(
                           SELECT 1 FROM organization_students
                           WHERE organization_id = $1 AND student_code = $2
                             AND user_id != $3
                       )""",
                    org_id,
                    body.student_code,
                    user_id,
                )
                if code_in_use:
                    raise HTTPException(409, "Student code is already in use in your organization.")

            await _validate_student_segments(
                conn,
                org_id,
                department_id=body.department_id,
                year_id=body.year_id,
                batch_id=body.batch_id,
            )
            access_at = datetime.now(timezone.utc) if body.grant_career_access else None
            row = await conn.fetchrow(
                """INSERT INTO organization_students
                   (organization_id, user_id, student_code, department_id, year_id, batch_id,
                    section, has_career_access, access_granted_at, access_granted_by, notes)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                   ON CONFLICT (organization_id, user_id) DO UPDATE SET
                     student_code = EXCLUDED.student_code,
                     department_id = EXCLUDED.department_id,
                     year_id = EXCLUDED.year_id,
                     batch_id = EXCLUDED.batch_id,
                     section = EXCLUDED.section,
                     has_career_access = EXCLUDED.has_career_access,
                     access_granted_at = EXCLUDED.access_granted_at,
                     access_granted_by = EXCLUDED.access_granted_by,
                     notes = EXCLUDED.notes,
                     status = 'active',
                     added_at = NOW(),
                     updated_at = NOW()
                   RETURNING *""",
                org_id, user_id, body.student_code, body.department_id, body.year_id,
                body.batch_id, body.section, body.grant_career_access, access_at,
                admin.user_id if body.grant_career_access else None, body.notes,
            )
            await conn.execute(
                "UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2", org_id, user_id,
            )
            from app.services.plan_access import sync_profile_plan_state
            await sync_profile_plan_state(conn, user_id, is_org_student=body.grant_career_access)
            await _log_action(
                conn, org_id, admin.user_id, "add_student",
                student_id=user_id, notes=f"Added {body.email}",
            )
        invalidate_local_user_context(user_id)
        row = (await org_measurement_rows(conn, org_id, [row]))[0]
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
               LEFT JOIN college_departments cd ON cd.id = os.department_id AND cd.organization_id = os.organization_id
               LEFT JOIN college_years       cy ON cy.id = os.year_id AND cy.organization_id = os.organization_id
               LEFT JOIN college_batches     cb ON cb.id = os.batch_id AND cb.organization_id = os.organization_id
               WHERE os.id = $1 AND os.organization_id = $2 AND os.status != 'removed'""",
            student_id, admin.organization_id,
        )
        if not row:
            raise HTTPException(404, "Student not found in your organization.")
        row = (await org_measurement_rows(conn, admin.organization_id, [row]))[0]
    return {"student": dict(row)}


@router.put("/students/{student_id}")
async def update_student(
    student_id: str,
    body: UpdateStudentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin(write=True)),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            existing = await _lock_student(conn, org_id, student_id)
            if existing["status"] == "removed":
                raise HTTPException(404, "Student not found in your organization.")
            sets, params, idx = [], [], 0
            provided_fields = body.model_fields_set
            for field in ["student_code", "department_id", "year_id", "batch_id", "section", "notes"]:
                if field in provided_fields:
                    val = getattr(body, field)
                    idx += 1; sets.append(f"{field} = ${idx}"); params.append(val)
            if not sets:
                raise HTTPException(400, "No fields to update.")

            effective_department = (
                body.department_id if "department_id" in provided_fields
                else (str(existing["department_id"]) if existing["department_id"] else None)
            )
            effective_year = (
                body.year_id if "year_id" in provided_fields
                else (str(existing["year_id"]) if existing["year_id"] else None)
            )
            effective_batch = (
                body.batch_id if "batch_id" in provided_fields
                else (str(existing["batch_id"]) if existing["batch_id"] else None)
            )
            await _validate_student_segments(
                conn,
                org_id,
                department_id=effective_department,
                year_id=effective_year,
                batch_id=effective_batch,
            )

            if "student_code" in provided_fields and body.student_code:
                code_in_use = await conn.fetchval(
                    """SELECT EXISTS(
                           SELECT 1 FROM organization_students
                           WHERE organization_id = $1 AND student_code = $2 AND id != $3
                       )""",
                    org_id,
                    body.student_code,
                    student_id,
                )
                if code_in_use:
                    raise HTTPException(409, "Student code is already in use in your organization.")
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


async def _lock_student(conn, org_id: str, student_id: str):
    """Use enrollment's organization -> profile -> membership lock order."""
    if not await conn.fetchval("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", org_id):
        raise HTTPException(404, "Organization not found.")
    owner = await conn.fetchval(
        """SELECT p.id FROM profiles p JOIN organization_students os ON os.user_id = p.id
           WHERE os.id = $1 AND os.organization_id = $2 FOR UPDATE OF p""",
        student_id, org_id,
    )
    if not owner:
        raise HTTPException(404, "Student not found in your organization.")
    return await conn.fetchrow(
        "SELECT * FROM organization_students WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        student_id, org_id,
    )


@router.delete("/students/{student_id}")
async def remove_student(
    student_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin(write=True)),
):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await _lock_student(conn, org_id, student_id)
            if row["status"] == "removed":
                return {"status": "removed"}
            user_id = str(row["user_id"])
            await conn.execute(
                """UPDATE organization_students SET status = 'removed', has_career_access = FALSE,
                   updated_at = NOW() WHERE id = $1 AND organization_id = $2""",
                student_id, org_id,
            )
            await conn.execute(
                """UPDATE profiles SET org_student = FALSE,
                   organization_id = CASE WHEN EXISTS (
                     SELECT 1 FROM organization_admins oa WHERE oa.user_id = profiles.id
                       AND oa.organization_id = $2 AND oa.status = 'active'
                   ) THEN organization_id ELSE NULL END
                   WHERE id = $1 AND organization_id = $2""", user_id, org_id,
            )
            # Personal entitlements survive removal; synchronize from their actual evidence.
            from app.services.plan_access import sync_profile_plan_state
            await sync_profile_plan_state(conn, user_id)
            await _log_action(conn, org_id, admin.user_id, "remove_student", student_id=user_id)
    invalidate_local_user_context(user_id)
    return {"status": "removed"}


async def _set_career_access(student_id: str, admin: OrgAdminProfile, enabled: bool):
    _validate_uuid(student_id, "student ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await _lock_student(conn, org_id, student_id)
            if row["status"] != "active":
                raise HTTPException(404, "Active student not found.")
            if bool(row["has_career_access"]) == enabled:
                return {"status": "already_granted" if enabled else "already_revoked"}
            user_id = str(row["user_id"])
            now = datetime.now(timezone.utc)
            await conn.execute(
                """UPDATE organization_students SET has_career_access = $1,
                   access_granted_at = CASE WHEN $1 THEN $2 ELSE access_granted_at END,
                   access_granted_by = CASE WHEN $1 THEN $3 ELSE access_granted_by END,
                   updated_at = $2 WHERE id = $4 AND organization_id = $5""",
                enabled, now, admin.user_id, student_id, org_id,
            )
            from app.services.plan_access import sync_profile_plan_state
            await sync_profile_plan_state(conn, user_id, is_org_student=enabled)
            await _log_action(conn, org_id, admin.user_id, "grant_access" if enabled else "revoke_access", student_id=user_id)
    invalidate_local_user_context(user_id)
    return {"status": "granted" if enabled else "revoked"}


@router.post("/students/{student_id}/grant-access")
async def grant_career_access(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin(write=True))):
    return await _set_career_access(student_id, admin, True)


@router.post("/students/{student_id}/revoke-access")
async def revoke_career_access(student_id: str, admin: OrgAdminProfile = Depends(require_org_admin(write=True))):
    return await _set_career_access(student_id, admin, False)


@router.post("/students/bulk")
async def bulk_upload_students(
    file: UploadFile = File(...),
    admin: OrgAdminProfile = Depends(require_org_admin(write=True)),
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
    normalized_headers = [h.strip().lower() for h in reader.fieldnames]
    if len(set(normalized_headers)) != len(normalized_headers):
        raise HTTPException(400, "CSV contains duplicate column names.")
    reader.fieldnames = normalized_headers
    headers = set(normalized_headers)
    missing = COLLEGE_CSV_REQUIRED_COLUMNS - headers
    if missing:
        raise HTTPException(400, f"Missing CSV columns: {', '.join(sorted(missing))}")

    rows = list(reader)
    if len(rows) > COLLEGE_CSV_MAX_ROWS:
        raise HTTPException(400, f"CSV exceeds {COLLEGE_CSV_MAX_ROWS} row limit.")

    async with DatabaseConnection() as conn:
        async with conn.transaction():
            org = await conn.fetchrow(
                """SELECT seat_limit, seats_used FROM organizations
                   WHERE id = $1 FOR UPDATE""",
                org_id,
            )
            if not org:
                raise HTTPException(404, "Organization not found.")
            available = max(0, int(org["seat_limit"] or 0) - int(org["seats_used"] or 0))
            # Pre-load segment maps: name → id (case-insensitive)
            depts = {r["department_name"].lower(): str(r["id"]) for r in await conn.fetch(
                "SELECT id, department_name FROM college_departments WHERE organization_id = $1", org_id)}
            yrs   = {r["year_name"].lower():       str(r["id"]) for r in await conn.fetch(
                "SELECT id, year_name FROM college_years WHERE organization_id = $1", org_id)}
            bats = {
                r["batch_name"].lower(): r
                for r in await conn.fetch(
                    """SELECT id, batch_name, year_id FROM college_batches
                       WHERE organization_id = $1""",
                    org_id,
                )
            }
            student_code_owners = {
                r["student_code"]: str(r["user_id"])
                for r in await conn.fetch(
                    """SELECT student_code, user_id FROM organization_students
                       WHERE organization_id = $1 AND student_code IS NOT NULL""",
                    org_id,
                )
            }

            # ✅ N+1 FIX: Bulk fetch ALL profiles and enrolled users in 2 queries
            all_emails = [
                (row.get("email") or "").strip().lower()
                for row in rows
                if (row.get("email") or "").strip()
            ]
            profile_rows = await conn.fetch(
                "SELECT id, email FROM profiles WHERE LOWER(email) = ANY($1::text[]) ORDER BY id FOR UPDATE",
                all_emails,
            )
            email_to_user_id: dict[str, str] = {
                r["email"].lower(): str(r["id"]) for r in profile_rows
            }
            enrolled_rows = await conn.fetch(
                """SELECT * FROM organization_students
                   WHERE user_id = ANY($1::uuid[]) AND status != 'removed'""",
                list(email_to_user_id.values()),
            )
            foreign_roles = {str(r["user_id"]) for r in await conn.fetch(
                """SELECT user_id FROM organization_admins WHERE user_id = ANY($1::uuid[])
                   AND organization_id != $2 AND status = 'active'""", list(email_to_user_id.values()), org_id)}
            foreign_memberships = {str(r["user_id"]) for r in enrolled_rows if str(r["organization_id"]) != str(org_id)}
            enrollment_orgs = {str(r["user_id"]): str(r["organization_id"]) for r in enrolled_rows}
            memberships = {str(r["user_id"]): dict(r) for r in enrolled_rows}
            ambiguous_emails = {email for email in all_emails
                                if sum(r["email"].lower() == email for r in profile_rows) > 1}

            success, failed, granted, already_enrolled = 0, [], 0, 0
            row_results = []
            changed_users = set()
            for i, row in enumerate(rows, 1):
                email  = (row.get("email") or "").strip()
                errors: list[str] = []
                if None in row:
                    errors.append("Unexpected extra CSV fields")
                if email.lower() in ambiguous_emails:
                    errors.append("Email identity is ambiguous")
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
                batch = bats.get(batch_name)
                batch_id = str(batch["id"]) if batch else None
                if dept_name  and not dept_id:
                    errors.append(f"Department '{row.get('department', '')}' not found")
                if year_name  and not year_id:
                    errors.append(f"Year '{row.get('year', '')}' not found")
                if batch_name and not batch_id:
                    errors.append(f"Batch '{row.get('batch', '')}' not found")
                if (
                    batch and year_id and batch["year_id"]
                    and str(batch["year_id"]) != str(year_id)
                ):
                    errors.append("Batch does not belong to the selected year")
                if errors:
                    failed.append({"row": i, "email": email, "errors": errors}); continue

                user_id = email_to_user_id.get(email.lower())
                if not user_id:
                    failed.append({"row": i, "email": email, "errors": ["No PrepVista account found"]}); continue
                if user_id in foreign_roles or user_id in foreign_memberships:
                    failed.append({"row": i, "email": email, "errors": ["Already belongs to another organization"]}); continue
                code_owner = student_code_owners.get(student_id_val)
                if code_owner and code_owner != user_id:
                    failed.append({"row": i, "email": email, "errors": ["Student ID is already in use"]}); continue
                if user_id in enrollment_orgs:
                    membership = memberships[user_id]
                    if enrollment_orgs[user_id] != str(org_id):
                        message = "Already belongs to another organization"
                    elif membership["status"] != "active":
                        message = "Membership is inactive; reactivate it explicitly"
                    else:
                        expected = {
                            "student_code": student_id_val, "department_id": dept_id,
                            "year_id": year_id, "batch_id": batch_id,
                            "section": (row.get("section") or "").strip() or None,
                            "notes": (row.get("notes") or "").strip() or None,
                        }
                        grant = (row.get("grant_career_access") or "").strip().lower() not in ("false", "no", "0")
                        if all((str(membership[k]) if membership[k] is not None else None) == v for k, v in expected.items()) and bool(membership["has_career_access"]) == grant:
                            already_enrolled += 1
                            row_results.append({"row": i, "email": email, "status": "already_enrolled"})
                            continue
                        message = "Already enrolled with different settings; use student update"
                    failed.append({"row": i, "email": email, "errors": [message]}); continue
                if available <= 0:
                    failed.append({"row": i, "email": email, "errors": ["Seat limit reached"]}); continue

                grant_str = (row.get("grant_career_access") or "").strip().lower()
                grant     = grant_str not in ("false", "no", "0")
                access_at = datetime.now(timezone.utc) if grant else None

                await conn.execute(
                    """INSERT INTO organization_students
                       (organization_id, user_id, student_code, department_id, year_id, batch_id,
                        section, has_career_access, access_granted_at, access_granted_by, notes)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                       ON CONFLICT (organization_id, user_id) DO UPDATE SET
                         student_code = EXCLUDED.student_code,
                         department_id = EXCLUDED.department_id,
                         year_id = EXCLUDED.year_id,
                         batch_id = EXCLUDED.batch_id,
                         section = EXCLUDED.section,
                         has_career_access = EXCLUDED.has_career_access,
                         access_granted_at = EXCLUDED.access_granted_at,
                         access_granted_by = EXCLUDED.access_granted_by,
                         notes = EXCLUDED.notes,
                         status = 'active',
                         added_at = NOW(),
                         updated_at = NOW()""",
                    org_id, user_id, student_id_val or None,
                    dept_id, year_id, batch_id,
                    (row.get("section") or "").strip() or None,
                    grant, access_at, admin.user_id if grant else None,
                    (row.get("notes") or "").strip() or None,
                )
                await conn.execute(
                    "UPDATE profiles SET org_student = TRUE, organization_id = $1 WHERE id = $2", org_id, user_id,
                )
                from app.services.plan_access import sync_profile_plan_state
                await sync_profile_plan_state(conn, user_id, is_org_student=grant)
                if grant:
                    granted += 1
                enrollment_orgs[user_id] = str(org_id)
                memberships[user_id] = {
                    "status": "active", "student_code": student_id_val,
                    "department_id": dept_id, "year_id": year_id, "batch_id": batch_id,
                    "section": (row.get("section") or "").strip() or None,
                    "notes": (row.get("notes") or "").strip() or None, "has_career_access": grant,
                }
                row_results.append({"row": i, "email": email, "status": "added"})
                student_code_owners[student_id_val] = user_id
                changed_users.add(user_id)
                success  += 1
                available -= 1

            await _log_action(
                conn, org_id, admin.user_id, "bulk_add",
                metadata={"success": success, "failed": len(failed), "granted": granted},
            )

    for user_id in changed_users:
        invalidate_local_user_context(user_id)
    return {
        "total_rows":            len(rows),
        "success":               success,
        "failed_count":          len(failed),
        "career_access_granted": granted,
        "failed_rows":           failed,
        "already_enrolled":      already_enrolled,
        "row_results": sorted(row_results + [{**r, "status": "failed"} for r in failed], key=lambda r: r["row"]),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACCESS CONTROL
# ══════════════════════════════════════════════════════════════════════════════
