"""
PrepVista — Placement Drives Router (Part 3 Integration)
=========================================================
Smart Eligibility Engine endpoints for TPO college admins.

API surface (all under /org/my/drives):
  GET  /                          list drives (filter by status)
  POST /                          create a new drive
  GET  /{id}                      get drive detail + latest snapshot
  POST /{id}/status               transition drive status (lifecycle state machine)
  POST /{id}/rules                add a new rule version (AND/OR/NOT JSON tree)
  POST /{id}/snapshot             run eligibility engine against current cohort
  GET  /summary                   drives KPI summary for dashboard widget

Eligibility engine (Python port of Part 3 TypeScript):
  Pure evaluate() function — AND/OR/NOT rule tree against student records.
  Gracefully returns null when placement_drives table absent (migration 026 pending).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter(prefix="/drives", tags=["placement-drives"])

# ── Drive lifecycle state machine (mirrored from Part 3 status.ts) ─────────────

DRIVE_TRANSITIONS: dict[str, list[str]] = {
    "DRAFT":               ["UNDER_REVIEW", "CANCELLED"],
    "UNDER_REVIEW":        ["APPROVED", "DRAFT", "CANCELLED"],
    "APPROVED":            ["PUBLISHED", "CANCELLED"],
    "PUBLISHED":           ["APPLICATIONS_OPEN", "CANCELLED"],
    "APPLICATIONS_OPEN":   ["APPLICATIONS_CLOSED", "CANCELLED"],
    "APPLICATIONS_CLOSED": ["IN_PROGRESS", "CANCELLED"],
    "IN_PROGRESS":         ["SELECTION_PENDING", "COMPLETED", "CANCELLED"],
    "SELECTION_PENDING":   ["COMPLETED", "CANCELLED"],
    "COMPLETED":           ["ARCHIVED"],
    "CANCELLED":           ["ARCHIVED"],
    "ARCHIVED":            [],
}

VALID_DRIVE_STATUSES = set(DRIVE_TRANSITIONS.keys())

def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in DRIVE_TRANSITIONS.get(from_status, [])


# ── Eligibility engine (Python port of Part 3 evaluate.ts + rules.ts) ─────────

def _get_field(student: dict, field: str):
    return student.get(field)

def _eval_leaf(leaf: dict, student: dict) -> bool:
    actual = _get_field(student, leaf["field"])
    comp   = leaf["comparator"]
    val    = leaf["value"]
    if comp == "GTE":      return isinstance(actual, (int, float)) and actual >= val
    if comp == "GT":       return isinstance(actual, (int, float)) and actual >  val
    if comp == "LTE":      return isinstance(actual, (int, float)) and actual <= val
    if comp == "LT":       return isinstance(actual, (int, float)) and actual <  val
    if comp == "EQ":       return actual == val
    if comp == "NEQ":      return actual != val
    if comp == "IN":       return isinstance(val, list) and str(actual) in [str(v) for v in val]
    if comp == "NOT_IN":   return isinstance(val, list) and str(actual) not in [str(v) for v in val]
    if comp == "HAS":      return isinstance(actual, list) and val in actual
    if comp == "HAS_ALL":  return isinstance(actual, list) and isinstance(val, list) and all(v in actual for v in val)
    return False

def _evaluate(node: dict, student: dict) -> bool:
    kind = node.get("kind")
    if kind == "LEAF":  return _eval_leaf(node, student)
    if kind == "NOT":   return not _evaluate(node["child"], student)
    if kind == "AND":   return all(_evaluate(c, student) for c in node.get("children", []))
    if kind == "OR":    return any(_evaluate(c, student) for c in node.get("children", []))
    return False

CATEGORY_PRIORITY = ["CGPA", "BACKLOG", "DEPARTMENT", "OTHER"]

def _leaf_results(node: dict, student: dict) -> list[dict]:
    """Walk tree and return flat list of {field, passed, category} for each leaf."""
    kind = node.get("kind")
    if kind == "LEAF":
        passed = _eval_leaf(node, student)
        return [{"field": node["field"], "passed": passed, "category": node.get("category", "OTHER")}]
    if kind == "NOT":
        return _leaf_results(node["child"], student)
    return [r for c in node.get("children", []) for r in _leaf_results(c, student)]

def _primary_failure(failed_leaves: list[dict]) -> str | None:
    if not failed_leaves:
        return None
    cats = {l["category"] for l in failed_leaves}
    for cat in CATEGORY_PRIORITY:
        if cat in cats:
            return cat
    return "OTHER"

def _evaluate_student(student: dict, rule_tree: dict, rule_version: int) -> dict:
    eligible   = _evaluate(rule_tree, student)
    leaves     = _leaf_results(rule_tree, student)
    failed     = [l for l in leaves if not l["passed"]]
    return {
        "student_id":              student.get("id") or student.get("user_id"),
        "eligible":                eligible,
        "primary_failure_category": None if eligible else _primary_failure(failed),
    }

def _summarize_cohort(students: list[dict], rule_tree: dict, rule_version: int) -> dict:
    results = [_evaluate_student(s, rule_tree, rule_version) for s in students]
    eligible_ids     = [r["student_id"] for r in results if r["eligible"]]
    not_eligible_ids = [r["student_id"] for r in results if not r["eligible"]]
    breakdown: dict[str, int] = {"CGPA": 0, "BACKLOG": 0, "DEPARTMENT": 0, "OTHER": 0}
    for r in results:
        if not r["eligible"] and r["primary_failure_category"]:
            cat = r["primary_failure_category"]
            breakdown[cat] = breakdown.get(cat, 0) + 1
    return {
        "total":                  len(students),
        "eligible_count":         len(eligible_ids),
        "not_eligible_count":     len(not_eligible_ids),
        "category_breakdown":     breakdown,
        "eligible_student_ids":   eligible_ids,
        "not_eligible_student_ids": not_eligible_ids,
    }


# ── Pydantic models ────────────────────────────────────────────────────────────

class CreateDriveRequest(BaseModel):
    title:        str
    company_name: str
    company_id:   Optional[str] = None
    role:         str
    description:  Optional[str] = None

class TransitionRequest(BaseModel):
    to_status: str
    reason:    Optional[str] = None

class AddRuleVersionRequest(BaseModel):
    rule_tree: dict   # AND/OR/NOT JSON tree matching Part 3 RuleNode schema
    reason:    Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/summary")
async def drives_summary(admin: OrgAdminProfile = Depends(require_org_admin())):
    """KPI summary for the dashboard widget. Graceful null on missing table."""
    org_id = admin.organization_id
    try:
        async with DatabaseConnection() as conn:
            row = await conn.fetchrow(
                """SELECT
                     COUNT(*)                                             AS total_drives,
                     COUNT(*) FILTER (WHERE status = 'DRAFT')            AS draft_count,
                     COUNT(*) FILTER (WHERE status = 'APPLICATIONS_OPEN') AS open_count,
                     COUNT(*) FILTER (WHERE status = 'COMPLETED')        AS completed_count,
                     COUNT(*) FILTER (WHERE status = 'PUBLISHED')        AS published_count,
                     COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')      AS in_progress_count
                   FROM placement_drives
                   WHERE organization_id = $1 AND status != 'ARCHIVED'""",
                org_id,
            )
    except Exception:
        return {"available": False}

    return {
        "available":        True,
        "total_drives":     int(row["total_drives"] or 0),
        "draft_count":      int(row["draft_count"] or 0),
        "open_count":       int(row["open_count"] or 0),
        "completed_count":  int(row["completed_count"] or 0),
        "published_count":  int(row["published_count"] or 0),
        "in_progress_count": int(row["in_progress_count"] or 0),
    }


@router.get("")
async def list_drives(
    status: Optional[str] = Query(None),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """List placement drives for the college, optionally filtered by status."""
    org_id = admin.organization_id
    if status and status not in VALID_DRIVE_STATUSES:
        raise HTTPException(422, "Invalid drive status")

    try:
        async with DatabaseConnection() as conn:
            if status:
                rows = await conn.fetch(
                    "SELECT id, title, company_name, role, status, created_at, updated_at FROM placement_drives WHERE organization_id = $1 AND status = $2 ORDER BY updated_at DESC",
                    org_id, status,
                )
            else:
                rows = await conn.fetch(
                    "SELECT id, title, company_name, role, status, created_at, updated_at FROM placement_drives WHERE organization_id = $1 AND status != 'ARCHIVED' ORDER BY updated_at DESC",
                    org_id,
                )
    except Exception:
        return {"items": [], "error": "Drives table not available — run migration 026"}

    return {"items": [dict(r) for r in rows]}


@router.post("")
async def create_drive(
    body: CreateDriveRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Create a new placement drive in DRAFT status."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """INSERT INTO placement_drives
               (organization_id, title, company_name, company_id, role, description, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING *""",
            org_id, body.title, body.company_name,
            UUID(body.company_id) if body.company_id else None,
            body.role, body.description, admin.user_id,
        )
        await conn.execute(
            """INSERT INTO drive_audit_log (drive_id, actor_id, actor_label, event_type, to_status, detail)
               VALUES ($1,$2,$3,'DRIVE_CREATED','DRAFT',$4)""",
            row["id"], admin.user_id, admin.email,
            json.dumps({"title": body.title, "company": body.company_name}),
        )
    return dict(row)


@router.get("/{drive_id}")
async def get_drive(
    drive_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Get drive detail with latest eligibility snapshot and rule version."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        drive = await conn.fetchrow(
            "SELECT * FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")

        latest_rule = await conn.fetchrow(
            "SELECT * FROM drive_eligibility_rule_versions WHERE drive_id = $1 ORDER BY version_number DESC LIMIT 1",
            drive_id,
        )
        latest_snapshot = await conn.fetchrow(
            "SELECT id, computed_at, total_students, eligible_count, not_eligible_count, category_breakdown FROM drive_eligibility_snapshots WHERE drive_id = $1 ORDER BY computed_at DESC LIMIT 1",
            drive_id,
        )
        audit_rows = await conn.fetch(
            "SELECT actor_label, event_type, from_status, to_status, occurred_at FROM drive_audit_log WHERE drive_id = $1 ORDER BY occurred_at DESC LIMIT 20",
            drive_id,
        )

    return {
        "drive":           dict(drive),
        "latest_rule":     dict(latest_rule) if latest_rule else None,
        "latest_snapshot": dict(latest_snapshot) if latest_snapshot else None,
        "audit":           [dict(r) for r in audit_rows],
        "legal_next_states": DRIVE_TRANSITIONS.get(drive["status"], []),
    }


@router.post("/{drive_id}/status")
async def transition_drive_status(
    drive_id: UUID,
    body: TransitionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Transition drive to a new lifecycle status."""
    org_id = admin.organization_id
    to_status = body.to_status.upper()

    async with DatabaseConnection() as conn:
        drive = await conn.fetchrow(
            "SELECT id, status FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")

        from_status = drive["status"]
        if not can_transition(from_status, to_status):
            raise HTTPException(422, f"Cannot transition from {from_status} to {to_status}")

        now = datetime.now(timezone.utc)
        extra: dict = {}
        if to_status == "PUBLISHED":       extra["published_at"] = now
        if to_status == "CANCELLED":       extra["cancelled_at"] = now
        if to_status in ("COMPLETED", "ARCHIVED"): extra["closed_at"] = now

        update_fields = ", ".join(f"{k} = ${i+3}" for i, k in enumerate(extra.keys()))
        extra_vals = list(extra.values())
        if update_fields:
            await conn.execute(
                f"UPDATE placement_drives SET status = $1, updated_at = now(), {update_fields} WHERE id = $2",
                to_status, drive_id, *extra_vals,
            )
        else:
            await conn.execute(
                "UPDATE placement_drives SET status = $1, updated_at = now() WHERE id = $2",
                to_status, drive_id,
            )

        await conn.execute(
            """INSERT INTO drive_audit_log (drive_id, actor_id, actor_label, event_type, from_status, to_status, detail)
               VALUES ($1,$2,$3,'STATUS_CHANGED',$4,$5,$6)""",
            drive_id, admin.user_id, admin.email, from_status, to_status,
            json.dumps({"reason": body.reason}),
        )

    return {"ok": True, "from_status": from_status, "to_status": to_status}


@router.post("/{drive_id}/rules")
async def add_rule_version(
    drive_id: UUID,
    body: AddRuleVersionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Add a new versioned eligibility rule tree to a drive."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        drive = await conn.fetchval(
            "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")

        # Get next version number
        max_ver = await conn.fetchval(
            "SELECT COALESCE(MAX(version_number), 0) FROM drive_eligibility_rule_versions WHERE drive_id = $1",
            drive_id,
        )
        next_ver = int(max_ver) + 1

        row = await conn.fetchrow(
            """INSERT INTO drive_eligibility_rule_versions
               (drive_id, version_number, rule_tree, created_by, reason)
               VALUES ($1,$2,$3,$4,$5)
               RETURNING *""",
            drive_id, next_ver, json.dumps(body.rule_tree), admin.user_id, body.reason,
        )
        await conn.execute(
            """INSERT INTO drive_audit_log (drive_id, actor_id, actor_label, event_type, detail)
               VALUES ($1,$2,$3,'RULE_VERSIONED',$4)""",
            drive_id, admin.user_id, admin.email,
            json.dumps({"version_number": next_ver, "reason": body.reason}),
        )

    return dict(row)


@router.post("/{drive_id}/snapshot")
async def compute_snapshot(
    drive_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Run eligibility engine against current active cohort and save an immutable snapshot."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        drive = await conn.fetchrow(
            "SELECT id, status FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")

        # Latest rule version
        rule_row = await conn.fetchrow(
            "SELECT * FROM drive_eligibility_rule_versions WHERE drive_id = $1 ORDER BY version_number DESC LIMIT 1",
            drive_id,
        )
        if not rule_row:
            raise HTTPException(422, "No eligibility rule version found for this drive. Add a rule first.")

        rule_tree = json.loads(rule_row["rule_tree"])
        rule_ver  = rule_row["version_number"]

        # Fetch active students with fields needed by the engine
        students = await conn.fetch(
            """SELECT
                 os.user_id       AS id,
                 p.full_name      AS name,
                 p.email,
                 COALESCE(iss.avg_score, 0)          AS cgpa,
                 0                                    AS active_backlogs,
                 0                                    AS total_backlogs,
                 0                                    AS graduation_year,
                 ARRAY[]::text[]                      AS skills,
                 ARRAY[]::text[]                      AS certifications,
                 0                                    AS internship_count,
                 0                                    AS experience_months,
                 'UNPLACED'                           AS placement_status,
                 'Engineering'                         AS department,
                 'BTech'                              AS program
               FROM organization_students os
               JOIN profiles p ON p.id = os.user_id
               LEFT JOIN LATERAL (
                 SELECT ROUND(AVG(final_score), 1) AS avg_score
                 FROM interview_sessions
                 WHERE user_id = os.user_id AND state = 'FINISHED'
               ) iss ON TRUE
               WHERE os.organization_id = $1 AND os.status = 'active'""",
            org_id,
        )

        student_dicts = [dict(s) for s in students]
        summary = _summarize_cohort(student_dicts, rule_tree, rule_ver)

        snap_row = await conn.fetchrow(
            """INSERT INTO drive_eligibility_snapshots
               (drive_id, rule_version_id, total_students, eligible_count, not_eligible_count,
                category_breakdown, eligible_student_ids, not_eligible_student_ids)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               RETURNING id, computed_at, total_students, eligible_count, not_eligible_count, category_breakdown""",
            drive_id, rule_row["id"],
            summary["total"], summary["eligible_count"], summary["not_eligible_count"],
            json.dumps(summary["category_breakdown"]),
            json.dumps([str(x) for x in summary["eligible_student_ids"]]),
            json.dumps([str(x) for x in summary["not_eligible_student_ids"]]),
        )
        await conn.execute(
            """INSERT INTO drive_audit_log (drive_id, actor_id, actor_label, event_type, detail)
               VALUES ($1,$2,$3,'SNAPSHOT_COMPUTED',$4)""",
            drive_id, admin.user_id, admin.email,
            json.dumps({
                "total": summary["total"],
                "eligible": summary["eligible_count"],
                "rule_version": rule_ver,
            }),
        )

    return dict(snap_row)