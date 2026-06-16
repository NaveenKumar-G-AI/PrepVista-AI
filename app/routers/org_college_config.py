"""
PrepVista AI - Org College Config
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

from app.routers.org_college_schemas import SegmentRequest, BatchRequest
from app.routers.org_college_helpers import _log_action, _validate_uuid, _paginate

router = APIRouter()

@router.get("/departments")
async def list_departments(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            "SELECT * FROM college_departments WHERE organization_id = $1 ORDER BY department_name",
            admin.organization_id,
        )
    return {"departments": [dict(r) for r in rows]}


@router.post("/departments")
async def create_department(
    body: SegmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO college_departments (organization_id, department_name, department_code, notes)
               VALUES ($1,$2,$3,$4) RETURNING *""",
            org_id, body.name, body.code, body.notes,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_add",
            entity_type="department", entity_id=row["id"],
        )
    return {"status": "created", "department": dict(row)}


@router.put("/departments/{dept_id}")
async def update_department(
    dept_id: str,
    body: SegmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(dept_id, "department ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_departments WHERE id = $1 AND organization_id = $2",
            dept_id, org_id,
        )
        if not existing:
            raise HTTPException(404, "Department not found.")
        await conn.execute(
            "UPDATE college_departments SET department_name=$1, department_code=$2, notes=$3, updated_at=NOW() WHERE id=$4 AND organization_id=$5",
            body.name, body.code, body.notes, dept_id, org_id,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_edit",
            entity_type="department", entity_id=dept_id,
        )
    return {"status": "updated"}


@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(dept_id, "department ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE department_id = $1 AND status = 'active'",
            dept_id,
        )
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this department.")
        await conn.execute(
            "DELETE FROM college_departments WHERE id = $1 AND organization_id = $2", dept_id, org_id
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_delete",
            entity_type="department", entity_id=dept_id,
        )
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# YEAR CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/years")
async def list_years(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            "SELECT * FROM college_years WHERE organization_id = $1 ORDER BY display_order",
            admin.organization_id,
        )
    return {"years": [dict(r) for r in rows]}


@router.post("/years")
async def create_year(
    body: SegmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "INSERT INTO college_years (organization_id, year_name, notes) VALUES ($1,$2,$3) RETURNING *",
            org_id, body.name, body.notes,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_add",
            entity_type="year", entity_id=row["id"],
        )
    return {"status": "created", "year": dict(row)}


@router.put("/years/{year_id}")
async def update_year(
    year_id: str,
    body: SegmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(year_id, "year ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_years WHERE id = $1 AND organization_id = $2", year_id, org_id
        )
        if not existing:
            raise HTTPException(404, "Year not found.")
        await conn.execute(
            "UPDATE college_years SET year_name=$1, notes=$2, updated_at=NOW() WHERE id=$3 AND organization_id=$4",
            body.name, body.notes, year_id, org_id,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_edit",
            entity_type="year", entity_id=year_id,
        )
    return {"status": "updated"}


@router.delete("/years/{year_id}")
async def delete_year(
    year_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(year_id, "year ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE year_id = $1 AND status = 'active'",
            year_id,
        )
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this year.")
        
        batch_count = await conn.fetchval(
            "SELECT COUNT(*) FROM college_batches WHERE year_id = $1 AND organization_id = $2",
            year_id, org_id
        )
        if batch_count > 0:
            raise HTTPException(400, f"Cannot delete: {batch_count} batches depend on this year. Move or delete them first.")

        await conn.execute(
            "DELETE FROM college_years WHERE id = $1 AND organization_id = $2", year_id, org_id
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_delete",
            entity_type="year", entity_id=year_id,
        )
    return {"status": "deleted"}


@router.post("/years/reorder")
async def reorder_years(
    year_ids: list[str],
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            for idx, y_id in enumerate(year_ids):
                _validate_uuid(y_id, "year ID")
                await conn.execute(
                    "UPDATE college_years SET display_order = $1 WHERE id = $2 AND organization_id = $3",
                    idx, y_id, org_id,
                )
        await _log_action(conn, org_id, admin.user_id, "segment_reorder", entity_type="year")
    return {"status": "reordered"}


# ══════════════════════════════════════════════════════════════════════════════
# BATCH CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/batches")
async def list_batches(admin: OrgAdminProfile = Depends(require_org_admin())):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT cb.*, cy.year_name FROM college_batches cb
               LEFT JOIN college_years cy ON cy.id = cb.year_id
               WHERE cb.organization_id = $1 ORDER BY cb.batch_name""",
            admin.organization_id,
        )
    return {"batches": [dict(r) for r in rows]}


@router.post("/batches")
async def create_batch(
    body: BatchRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO college_batches (organization_id, batch_name, batch_code, year_id, notes)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            org_id, body.name, body.code, body.year_id, body.notes,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_add",
            entity_type="batch", entity_id=row["id"],
        )
    return {"status": "created", "batch": dict(row)}


@router.put("/batches/{batch_id}")
async def update_batch(
    batch_id: str,
    body: BatchRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(batch_id, "batch ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM college_batches WHERE id = $1 AND organization_id = $2", batch_id, org_id
        )
        if not existing:
            raise HTTPException(404, "Batch not found.")
        await conn.execute(
            "UPDATE college_batches SET batch_name=$1, batch_code=$2, year_id=$3, notes=$4, updated_at=NOW() WHERE id=$5 AND organization_id=$6",
            body.name, body.code, body.year_id, body.notes, batch_id, org_id,
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_edit",
            entity_type="batch", entity_id=batch_id,
        )
    return {"status": "updated"}


@router.delete("/batches/{batch_id}")
async def delete_batch(
    batch_id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    _validate_uuid(batch_id, "batch ID")
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE batch_id = $1 AND status = 'active'",
            batch_id,
        )
        if count > 0:
            raise HTTPException(400, f"Cannot delete: {count} active students in this batch.")
        await conn.execute(
            "DELETE FROM college_batches WHERE id = $1 AND organization_id = $2", batch_id, org_id
        )
        await _log_action(
            conn, org_id, admin.user_id, "segment_delete",
            entity_type="batch", entity_id=batch_id,
        )
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# ANALYTICS  (extended: category scores, readiness tiers, viz shapes added)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/access-log")
async def college_access_log(
    page:      int = 1,
    page_size: int = ORG_DEFAULT_PAGE_SIZE,
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
            org_id, ps, offset,
        )
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_access_log WHERE organization_id = $1", org_id
        )
    return {
        "access_log": [dict(r) for r in rows],
        "total":      total,
        "page":       page,
        "page_size":  ps,
    }


# ══════════════════════════════════════════════════════════════════════════════
# BILLING
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/billing")
async def college_billing(admin: OrgAdminProfile = Depends(require_org_admin())):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow(
            "SELECT plan, seat_limit, seats_used, access_expiry FROM organizations WHERE id = $1",
            org_id,
        )
        allocations = await conn.fetch(
            "SELECT * FROM org_plan_allocations WHERE organization_id = $1 ORDER BY created_at DESC",
            org_id,
        )
        payments = await conn.fetch(
            "SELECT * FROM org_payments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50",
            org_id,
        )
    return {
        "plan":         org["plan"]          if org else None,
        "seat_limit":   org["seat_limit"]    if org else 0,
        "seats_used":   org["seats_used"]    if org else 0,
        "access_expiry":org["access_expiry"] if org else None,
        "allocations":  [dict(a) for a in allocations],
        "payments":     [dict(p) for p in payments],
    }


# ══════════════════════════════════════════════════════════════════════════════
# BULK UPLOAD
# ══════════════════════════════════════════════════════════════════════════════
