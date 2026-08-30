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
  All results are derived from persisted student attributes; unsupported
  eligibility fields are rejected instead of being guessed.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

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

SUPPORTED_RULE_FIELDS: dict[str, str] = {
    "readiness_score": "number",
    "readiness_tier": "text",
    "is_zero_offer_risk": "boolean",
    "graduation_year": "number",
    "department": "text",
    "department_code": "text",
    "year": "text",
    "batch": "text",
    "section": "text",
    "student_code": "text",
    "total_sessions_completed": "number",
    "sessions_without_improvement": "number",
    "score_delta": "number",
    "target_role": "text",
}
VALID_COMPARATORS = {"GTE", "GT", "LTE", "LT", "EQ", "NEQ", "IN", "NOT_IN"}
NUMERIC_COMPARATORS = {"GTE", "GT", "LTE", "LT"}
VALID_FAILURE_CATEGORIES = {"SCORE", "DEPARTMENT", "ACADEMIC_YEAR", "EXPERIENCE", "OTHER"}
MAX_RULE_DEPTH = 10
MAX_RULE_NODES = 100

def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in DRIVE_TRANSITIONS.get(from_status, [])


# ── Eligibility engine (Python port of Part 3 evaluate.ts + rules.ts) ─────────

def _get_field(student: dict, field: str):
    return student.get(field)

def _eval_leaf(leaf: dict[str, Any], student: dict[str, Any]) -> bool:
    actual = _get_field(student, leaf["field"])
    comp   = leaf["comparator"]
    val    = leaf["value"]
    if actual is None:
        return comp == "EQ" and val is None
    if comp == "GTE":      return isinstance(actual, (int, float)) and actual >= val
    if comp == "GT":       return isinstance(actual, (int, float)) and actual >  val
    if comp == "LTE":      return isinstance(actual, (int, float)) and actual <= val
    if comp == "LT":       return isinstance(actual, (int, float)) and actual <  val
    if comp == "EQ":       return actual == val
    if comp == "NEQ":      return actual != val
    if comp == "IN":       return isinstance(val, list) and actual in val
    if comp == "NOT_IN":   return isinstance(val, list) and actual not in val
    return False

def _evaluate(node: dict, student: dict) -> bool:
    kind = node.get("kind")
    if kind == "LEAF":  return _eval_leaf(node, student)
    if kind == "NOT":   return not _evaluate(node["child"], student)
    if kind == "AND":   return all(_evaluate(c, student) for c in node.get("children", []))
    if kind == "OR":    return any(_evaluate(c, student) for c in node.get("children", []))
    return False

CATEGORY_PRIORITY = ["SCORE", "DEPARTMENT", "ACADEMIC_YEAR", "EXPERIENCE", "OTHER"]

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

def _evaluate_student(student: dict, rule_tree: dict) -> dict:
    eligible   = _evaluate(rule_tree, student)
    leaves     = _leaf_results(rule_tree, student)
    failed     = [l for l in leaves if not l["passed"]]
    return {
        "student_id":              student.get("id") or student.get("user_id"),
        "eligible":                eligible,
        "primary_failure_category": None if eligible else _primary_failure(failed),
    }

def _summarize_cohort(students: list[dict], rule_tree: dict) -> dict:
    results = [_evaluate_student(s, rule_tree) for s in students]
    eligible_ids     = [r["student_id"] for r in results if r["eligible"]]
    not_eligible_ids = [r["student_id"] for r in results if not r["eligible"]]
    breakdown: dict[str, int] = {category: 0 for category in CATEGORY_PRIORITY}
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
    title: str = Field(min_length=1, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)
    company_id: UUID | None = None
    role: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)

    @field_validator("title", "company_name", "role")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

class TransitionRequest(BaseModel):
    to_status: str = Field(min_length=1, max_length=40)
    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("to_status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in VALID_DRIVE_STATUSES:
            raise ValueError("invalid drive status")
        return normalized

class AddRuleVersionRequest(BaseModel):
    rule_tree: dict[str, Any]
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_rule_tree(self) -> "AddRuleVersionRequest":
        node_count = 0

        def walk(node: Any, depth: int = 1) -> None:
            nonlocal node_count
            if not isinstance(node, dict):
                raise ValueError("every rule node must be an object")
            node_count += 1
            if node_count > MAX_RULE_NODES:
                raise ValueError(f"rule tree cannot contain more than {MAX_RULE_NODES} nodes")
            if depth > MAX_RULE_DEPTH:
                raise ValueError(f"rule tree cannot be deeper than {MAX_RULE_DEPTH} levels")

            kind = node.get("kind")
            if kind == "LEAF":
                field = node.get("field")
                comparator = node.get("comparator")
                value = node.get("value")
                if field not in SUPPORTED_RULE_FIELDS:
                    raise ValueError(f"unsupported eligibility field: {field}")
                if comparator not in VALID_COMPARATORS:
                    raise ValueError(f"unsupported comparator: {comparator}")
                if comparator in NUMERIC_COMPARATORS:
                    if SUPPORTED_RULE_FIELDS[field] != "number" or isinstance(value, bool) or not isinstance(value, (int, float)):
                        raise ValueError(f"{comparator} requires a numeric field and value")
                if comparator in {"IN", "NOT_IN"}:
                    if not isinstance(value, list) or not 1 <= len(value) <= 100:
                        raise ValueError(f"{comparator} requires a list containing 1 to 100 values")
                category = node.get("category", "OTHER")
                if category not in VALID_FAILURE_CATEGORIES:
                    raise ValueError(f"unsupported failure category: {category}")
                return
            if kind == "NOT":
                walk(node.get("child"), depth + 1)
                return
            if kind in {"AND", "OR"}:
                children = node.get("children")
                if not isinstance(children, list) or not 1 <= len(children) <= 50:
                    raise ValueError(f"{kind} requires between 1 and 50 child nodes")
                for child in children:
                    walk(child, depth + 1)
                return
            raise ValueError("rule node kind must be LEAF, NOT, AND, or OR")

        walk(self.rule_tree)
        return self


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/summary")
async def drives_summary(admin: OrgAdminProfile = Depends(require_org_admin())):
    """KPI summary for the dashboard widget."""
    org_id = admin.organization_id
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

    async with DatabaseConnection() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT id, title, company_name, company_id, role, status, created_at, updated_at FROM placement_drives WHERE organization_id = $1 AND status = $2 ORDER BY updated_at DESC",
                org_id, status,
            )
        else:
            rows = await conn.fetch(
                "SELECT id, title, company_name, company_id, role, status, created_at, updated_at FROM placement_drives WHERE organization_id = $1 AND status != 'ARCHIVED' ORDER BY updated_at DESC",
                org_id,
            )

    return {"items": [dict(r) for r in rows]}


@router.post("")
async def create_drive(
    body: CreateDriveRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Create a new placement drive in DRAFT status."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            if body.company_id:
                company_exists = await conn.fetchval(
                    "SELECT 1 FROM recruiter_companies WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'",
                    body.company_id,
                    org_id,
                )
                if not company_exists:
                    raise HTTPException(422, "Recruiter company is not active for this organization")
            row = await conn.fetchrow(
                """INSERT INTO placement_drives
                   (organization_id, title, company_name, company_id, role, description, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)
                   RETURNING *""",
                org_id, body.title, body.company_name, body.company_id,
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
        async with conn.transaction():
            drive = await conn.fetchrow(
                "SELECT id, status FROM placement_drives WHERE id = $1 AND organization_id = $2 FOR UPDATE",
                drive_id, org_id,
            )
            if not drive:
                raise HTTPException(404, "Drive not found")

            from_status = drive["status"]
            if not can_transition(from_status, to_status):
                raise HTTPException(422, f"Cannot transition from {from_status} to {to_status}")

            now = datetime.now(timezone.utc)
            extra: dict[str, datetime] = {}
            if to_status == "PUBLISHED":
                extra["published_at"] = now
            if to_status == "CANCELLED":
                extra["cancelled_at"] = now
            if to_status in ("COMPLETED", "ARCHIVED"):
                extra["closed_at"] = now

            update_fields = ", ".join(f"{key} = ${index + 3}" for index, key in enumerate(extra))
            if update_fields:
                await conn.execute(
                    f"UPDATE placement_drives SET status = $1, updated_at = now(), {update_fields} WHERE id = $2",
                    to_status, drive_id, *extra.values(),
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
        async with conn.transaction():
            drive = await conn.fetchval(
                "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2 FOR UPDATE",
                drive_id, org_id,
            )
            if not drive:
                raise HTTPException(404, "Drive not found")

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
                """UPDATE placement_drives
                   SET active_rule_version_fk = $1, updated_at = now()
                   WHERE id = $2""",
                row["id"], drive_id,
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
        async with conn.transaction():
            drive = await conn.fetchrow(
                "SELECT id, status FROM placement_drives WHERE id = $1 AND organization_id = $2 FOR UPDATE",
                drive_id, org_id,
            )
            if not drive:
                raise HTTPException(404, "Drive not found")

            rule_row = await conn.fetchrow(
                "SELECT * FROM drive_eligibility_rule_versions WHERE drive_id = $1 ORDER BY version_number DESC LIMIT 1",
                drive_id,
            )
            if not rule_row:
                raise HTTPException(422, "No eligibility rule version found for this drive. Add a rule first.")

            raw_rule_tree = rule_row["rule_tree"]
            rule_tree = json.loads(raw_rule_tree) if isinstance(raw_rule_tree, str) else raw_rule_tree
            AddRuleVersionRequest(rule_tree=rule_tree)
            rule_version = rule_row["version_number"]

            students = await conn.fetch(
                """SELECT
                     os.user_id AS id,
                     p.full_name AS name,
                     p.email,
                     os.latest_overall_score::double precision AS readiness_score,
                     os.readiness_tier,
                     os.is_zero_offer_risk,
                     p.graduation_year,
                     cd.department_name AS department,
                     cd.department_code,
                     cy.year_name AS year,
                     cb.batch_name AS batch,
                     os.section,
                     os.student_code,
                     os.total_sessions_completed,
                     os.sessions_without_improvement,
                     os.score_delta::double precision AS score_delta,
                     p.target_role
                   FROM organization_students os
                   JOIN profiles p ON p.id = os.user_id
                   LEFT JOIN college_departments cd ON cd.id = os.department_id
                   LEFT JOIN college_years cy ON cy.id = os.year_id
                   LEFT JOIN college_batches cb ON cb.id = os.batch_id
                   WHERE os.organization_id = $1 AND os.status = 'active'""",
                org_id,
            )

            summary = _summarize_cohort([dict(student) for student in students], rule_tree)

            snap_row = await conn.fetchrow(
                """INSERT INTO drive_eligibility_snapshots
                   (drive_id, rule_version_id, total_students, eligible_count, not_eligible_count,
                    category_breakdown, eligible_student_ids, not_eligible_student_ids)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   RETURNING id, computed_at, total_students, eligible_count, not_eligible_count, category_breakdown""",
                drive_id, rule_row["id"],
                summary["total"], summary["eligible_count"], summary["not_eligible_count"],
                json.dumps(summary["category_breakdown"]),
                json.dumps([str(value) for value in summary["eligible_student_ids"]]),
                json.dumps([str(value) for value in summary["not_eligible_student_ids"]]),
            )
            await conn.execute(
                """INSERT INTO drive_audit_log (drive_id, actor_id, actor_label, event_type, detail)
                   VALUES ($1,$2,$3,'SNAPSHOT_COMPUTED',$4)""",
                drive_id, admin.user_id, admin.email,
                json.dumps({
                    "total": summary["total"],
                    "eligible": summary["eligible_count"],
                    "rule_version": rule_version,
                }),
            )

    return dict(snap_row)
