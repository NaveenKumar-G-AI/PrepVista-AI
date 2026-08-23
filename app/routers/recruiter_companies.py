"""
PrepVista AI — Recruiter Companies Router (Part 2 Integration)
==============================================================
Endpoints under /org/my/companies/* for TPO college admins to manage
their recruiter CRM: companies, contacts, activities, follow-ups, and notes.

Integrates the Part 2 "Companies & Recruiters" domain into the existing
org-admin backend. All routes require college-admin auth (require_org_admin).

New API surface:
  GET  /companies              — list with search/stage/repeat filters + pagination
  POST /companies              — create company (with duplicate name/domain detection)
  GET  /companies/{id}         — company dossier (contacts + recent activity)
  GET  /companies/pulse        — recruiter pulse KPIs for dashboard widget
  POST /companies/{id}/stage   — change relationship stage
  POST /companies/{id}/contacts        — add recruiter contact
  POST /companies/{id}/activities      — log an activity
  POST /companies/{id}/followups       — create a follow-up
  GET  /followups              — follow-up command centre (overdue/today/upcoming)
  PATCH /followups/{id}/complete       — mark follow-up done
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter(prefix="/companies", tags=["recruiter-companies"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()

def _extract_domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    url = url.lower().strip()
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url)
    return url.split("/")[0] or None

VALID_STAGES = {
    "PROSPECT", "CONTACTED", "INTERESTED", "REQUIREMENT_RECEIVED",
    "DRIVE_SCHEDULED", "DRIVE_COMPLETED", "HIRING", "REPEAT_RECRUITER", "INACTIVE",
}

# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateCompanyRequest(BaseModel):
    name: str
    legal_name: Optional[str] = None
    website: Optional[str] = None
    sector: Optional[str] = None
    company_size: Optional[str] = None
    headquarters_city: Optional[str] = None
    description: Optional[str] = None
    allow_duplicate: bool = False

class ChangeStageRequest(BaseModel):
    stage: str
    reason: Optional[str] = None

class AddContactRequest(BaseModel):
    name: str
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    preferred_channel: Optional[str] = None
    is_primary: bool = False

class LogActivityRequest(BaseModel):
    type: str
    subject: Optional[str] = None
    summary: Optional[str] = None
    next_action: Optional[str] = None

class CreateFollowupRequest(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "MEDIUM"
    due_at: str   # ISO datetime string


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/pulse")
async def recruiter_pulse(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Recruiter Pulse KPIs for the dashboard widget.

    Returns live counts — nothing hardcoded. Gracefully returns zeros when the
    recruiter_companies table has no rows (new org). Matches Part 2
    commandCentreService.getRecruiterPulse() output shape.
    """
    org_id = admin.organization_id
    now_ts = _now()
    thirty_ago = datetime.now(timezone.utc).replace(
        day=max(1, datetime.now(timezone.utc).day - 30)
    ).isoformat()

    try:
        async with DatabaseConnection() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                  COUNT(*)                                                         AS companies,
                  COUNT(*) FILTER (WHERE relationship_stage NOT IN ('PROSPECT','INACTIVE'))
                                                                                   AS active_relationships,
                  COUNT(*) FILTER (WHERE relationship_stage = 'REPEAT_RECRUITER') AS repeat_recruiters,
                  COUNT(*) FILTER (WHERE created_at >= $2)                        AS new_last_30d
                FROM recruiter_companies
                WHERE organization_id = $1 AND status = 'ACTIVE'
                """,
                org_id, thirty_ago,
            )
            fu_row = await conn.fetchrow(
                """
                SELECT
                  COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS'))               AS open_followups,
                  COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS') AND due_at < $2) AS overdue_followups
                FROM recruiter_followups
                WHERE organization_id = $1
                """,
                org_id, now_ts,
            )
            req_row = await conn.fetchrow(
                """
                SELECT COUNT(*) AS requirements_received
                FROM recruiter_activities
                WHERE organization_id = $1
                  AND type = 'REQUIREMENT_RECEIVED'
                  AND occurred_at >= $2
                """,
                org_id, thirty_ago,
            )
    except Exception:
        # Table absent (migration not yet run) — return empty pulse
        return {
            "companies": 0, "active_relationships": 0, "open_followups": 0,
            "overdue_followups": 0, "new_relationships_last_30d": 0,
            "repeat_recruiters": 0, "requirements_received_last_30d": 0,
            "is_empty": True,
        }

    return {
        "companies":                      int(row["companies"] or 0),
        "active_relationships":           int(row["active_relationships"] or 0),
        "open_followups":                 int(fu_row["open_followups"] or 0),
        "overdue_followups":              int(fu_row["overdue_followups"] or 0),
        "new_relationships_last_30d":     int(row["new_last_30d"] or 0),
        "repeat_recruiters":              int(row["repeat_recruiters"] or 0),
        "requirements_received_last_30d": int(req_row["requirements_received"] or 0),
        "is_empty":                       int(row["companies"] or 0) == 0,
    }


@router.get("")
async def list_recruiter_companies(
    search:        Optional[str] = Query(None, max_length=200),
    stage:         Optional[str] = Query(None),
    repeat_only:   bool          = Query(False),
    page:          int           = Query(1, ge=1),
    page_size:     int           = Query(25, ge=1, le=100),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """List companies with search/stage/repeat filters and pagination."""
    org_id = admin.organization_id
    conditions = ["organization_id = $1", "status = 'ACTIVE'"]
    params: list = [org_id]

    if search:
        params.append(f"%{search.lower()}%")
        conditions.append(f"normalized_name ILIKE ${len(params)}")

    if stage and stage in VALID_STAGES:
        params.append(stage)
        conditions.append(f"relationship_stage = ${len(params)}")

    if repeat_only:
        conditions.append("is_repeat_recruiter = TRUE")

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    async with DatabaseConnection() as conn:
        total_row = await conn.fetchrow(f"SELECT COUNT(*) AS n FROM recruiter_companies WHERE {where}", *params)
        params.extend([page_size, offset])
        rows = await conn.fetch(
            f"""SELECT id, name, relationship_stage, headquarters_city, website,
                       is_repeat_recruiter, created_at, updated_at
                FROM recruiter_companies WHERE {where}
                ORDER BY updated_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}""",
            *params,
        )

    return {
        "items":     [dict(r) for r in rows],
        "total":     int(total_row["n"]),
        "page":      page,
        "page_size": page_size,
    }


@router.post("")
async def create_recruiter_company(
    body: CreateCompanyRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Create a company. Duplicate name/domain detection raises 409."""
    org_id  = admin.organization_id
    norm    = _normalize(body.name)
    domain  = _extract_domain(body.website)

    async with DatabaseConnection() as conn:
        # Duplicate detection
        if not body.allow_duplicate:
            dup = await conn.fetchrow(
                "SELECT id, name FROM recruiter_companies WHERE organization_id = $1 AND normalized_name = $2 AND status = 'ACTIVE'",
                org_id, norm,
            )
            if dup:
                raise HTTPException(409, detail={"error": "Duplicate company name", "duplicate_id": str(dup["id"])})

        row = await conn.fetchrow(
            """INSERT INTO recruiter_companies
               (organization_id, name, normalized_name, legal_name, website, website_domain,
                sector, company_size, headquarters_city, description, relationship_stage)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PROSPECT')
               RETURNING *""",
            org_id, body.name.strip(), norm, body.legal_name, body.website, domain,
            body.sector, body.company_size, body.headquarters_city, body.description,
        )

        # Write stage history row
        await conn.execute(
            "INSERT INTO recruiter_status_history (company_id, old_stage, new_stage, reason) VALUES ($1, NULL, 'PROSPECT', 'Created')",
            row["id"],
        )

    return dict(row)


@router.get("/{company_id}")
async def get_recruiter_company(
    company_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Full company dossier — company + contacts + 20 most recent activities."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        company = await conn.fetchrow(
            "SELECT * FROM recruiter_companies WHERE id = $1 AND organization_id = $2",
            company_id, org_id,
        )
        if not company:
            raise HTTPException(404, "Company not found")

        contacts = await conn.fetch(
            "SELECT * FROM recruiter_contacts WHERE company_id = $1 ORDER BY is_primary DESC, created_at",
            company_id,
        )
        activities = await conn.fetch(
            "SELECT * FROM recruiter_activities WHERE company_id = $1 ORDER BY occurred_at DESC LIMIT 20",
            company_id,
        )
        followups = await conn.fetch(
            "SELECT * FROM recruiter_followups WHERE company_id = $1 AND status IN ('OPEN','IN_PROGRESS') ORDER BY due_at",
            company_id,
        )

    return {
        "company":    dict(company),
        "contacts":   [dict(r) for r in contacts],
        "activities": [dict(r) for r in activities],
        "followups":  [dict(r) for r in followups],
    }


@router.post("/{company_id}/stage")
async def change_company_stage(
    company_id: UUID,
    body: ChangeStageRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Move a company to a new relationship stage."""
    if body.stage not in VALID_STAGES:
        raise HTTPException(422, "Invalid relationship stage")

    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        old = await conn.fetchrow(
            "SELECT relationship_stage FROM recruiter_companies WHERE id = $1 AND organization_id = $2",
            company_id, org_id,
        )
        if not old:
            raise HTTPException(404, "Company not found")

        is_repeat = body.stage == "REPEAT_RECRUITER"
        await conn.execute(
            """UPDATE recruiter_companies
               SET relationship_stage = $1, is_repeat_recruiter = $2, updated_at = now()
               WHERE id = $3""",
            body.stage, is_repeat, company_id,
        )
        await conn.execute(
            "INSERT INTO recruiter_status_history (company_id, old_stage, new_stage, actor_id, reason) VALUES ($1,$2,$3,$4,$5)",
            company_id, old["relationship_stage"], body.stage, admin.user_id, body.reason,
        )

    return {"ok": True, "stage": body.stage}


@router.post("/{company_id}/contacts")
async def add_recruiter_contact(
    company_id: UUID,
    body: AddContactRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Add a contact to a company."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM recruiter_companies WHERE id = $1 AND organization_id = $2",
            company_id, org_id,
        )
        if not exists:
            raise HTTPException(404, "Company not found")

        # If new contact is primary, demote existing primary
        if body.is_primary:
            await conn.execute(
                "UPDATE recruiter_contacts SET is_primary = FALSE WHERE company_id = $1 AND is_primary = TRUE",
                company_id,
            )

        row = await conn.fetchrow(
            """INSERT INTO recruiter_contacts
               (organization_id, company_id, name, designation, email, phone,
                linkedin_url, preferred_channel, is_primary)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               RETURNING *""",
            org_id, company_id, body.name, body.designation, body.email,
            body.phone, body.linkedin_url, body.preferred_channel, body.is_primary,
        )
    return dict(row)


@router.post("/{company_id}/activities")
async def log_recruiter_activity(
    company_id: UUID,
    body: LogActivityRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Log an activity against a company."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM recruiter_companies WHERE id = $1 AND organization_id = $2",
            company_id, org_id,
        )
        if not exists:
            raise HTTPException(404, "Company not found")

        row = await conn.fetchrow(
            """INSERT INTO recruiter_activities
               (organization_id, company_id, actor_id, type, subject, summary, next_action)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING *""",
            org_id, company_id, admin.user_id, body.type,
            body.subject, body.summary, body.next_action,
        )
        # Bump company updated_at
        await conn.execute("UPDATE recruiter_companies SET updated_at = now() WHERE id = $1", company_id)
    return dict(row)


@router.post("/{company_id}/followups")
async def create_recruiter_followup(
    company_id: UUID,
    body: CreateFollowupRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Create a follow-up task."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM recruiter_companies WHERE id = $1 AND organization_id = $2",
            company_id, org_id,
        )
        if not exists:
            raise HTTPException(404, "Company not found")

        row = await conn.fetchrow(
            """INSERT INTO recruiter_followups
               (organization_id, company_id, owner_id, title, description, priority, due_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING *""",
            org_id, company_id, admin.user_id, body.title,
            body.description, body.priority, body.due_at,
        )
    return dict(row)


# ── Follow-up command centre (standalone endpoint, no company_id) ─────────────

followup_router = APIRouter(prefix="/followups", tags=["recruiter-followups"])

@followup_router.get("")
async def followup_command_centre(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Bucketised follow-up command centre: OVERDUE / TODAY / THIS_WEEK / OPEN."""
    org_id = admin.organization_id
    now = datetime.now(timezone.utc)
    today_end   = now.replace(hour=23, minute=59, second=59).isoformat()
    week_end    = now.replace(hour=23, minute=59, second=59,
                              day=min(now.day + 6, 28)).isoformat()

    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT rf.*, rc.name AS company_name
               FROM recruiter_followups rf
               JOIN recruiter_companies rc ON rc.id = rf.company_id
               WHERE rf.organization_id = $1 AND rf.status IN ('OPEN','IN_PROGRESS')
               ORDER BY rf.due_at""",
            org_id,
        )

    buckets: dict = {"OVERDUE": [], "TODAY": [], "THIS_WEEK": [], "OPEN": []}
    now_iso = now.isoformat()
    for r in rows:
        d = dict(r)
        due = str(d["due_at"])
        if due < now_iso:
            buckets["OVERDUE"].append(d)
        elif due <= today_end:
            buckets["TODAY"].append(d)
        elif due <= week_end:
            buckets["THIS_WEEK"].append(d)
        else:
            buckets["OPEN"].append(d)

    return {"buckets": buckets}


@followup_router.patch("/{followup_id}/complete")
async def complete_followup(
    followup_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Mark a follow-up as completed."""
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """UPDATE recruiter_followups
               SET status = 'COMPLETED', completed_at = now(), completed_by = $1, updated_at = now()
               WHERE id = $2 AND organization_id = $3
               RETURNING *""",
            admin.user_id, followup_id, admin.organization_id,
        )
        if not row:
            raise HTTPException(404, "Follow-up not found")
    return dict(row)
