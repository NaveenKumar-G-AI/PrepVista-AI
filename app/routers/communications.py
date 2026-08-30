"""Tenant-scoped in-app communications for colleges and their students."""

from __future__ import annotations

import json
import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, UserProfile, get_current_user, require_org_admin
from app.services.llm import call_llm_json

router = APIRouter(prefix="/communications", tags=["communications"])

MessageType = Literal[
    "ANNOUNCEMENT", "DRIVE_NOTIFICATION", "DEADLINE_REMINDER",
    "INTERVIEW_NOTIFICATION", "RESULT_NOTIFICATION", "OFFER_NOTIFICATION",
    "JOINING_NOTIFICATION", "TRAINING_NOTIFICATION",
]
Priority = Literal["LOW", "NORMAL", "HIGH", "URGENT"]
IssueCategory = Literal[
    "INTERVIEW_INFO", "LINK_BROKEN", "APPLICATION", "ELIGIBILITY",
    "OFFER", "JOINING", "TECHNICAL", "GENERAL",
]
IssueStatus = Literal["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]

_TEMPLATE_RE = re.compile(r"\{\{([a-z_]+)\}\}")
_KNOWN_TEMPLATE_VARIABLES = {
    "student_name", "company_name", "role", "drive_name",
    "deadline", "interview_date", "interview_time", "joining_date",
}
_ISSUE_PRIORITY: dict[str, str] = {
    "INTERVIEW_INFO": "HIGH",
    "LINK_BROKEN": "URGENT",
    "APPLICATION": "NORMAL",
    "ELIGIBILITY": "NORMAL",
    "OFFER": "HIGH",
    "JOINING": "NORMAL",
    "TECHNICAL": "NORMAL",
    "GENERAL": "LOW",
}


class AudienceRequest(BaseModel):
    all_active: bool = False
    student_ids: list[UUID] = Field(default_factory=list, max_length=1000)
    department_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_audience(self) -> "AudienceRequest":
        if not self.all_active and not self.student_ids and not self.department_ids:
            raise ValueError("Select all active students, departments, or individual students")
        return self


class SendMessageRequest(BaseModel):
    message_type: MessageType = "ANNOUNCEMENT"
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=10000)
    priority: Priority = "NORMAL"
    requires_ack: bool = False
    drive_id: UUID | None = None
    audience: AudienceRequest

    @field_validator("subject", "body")
    @classmethod
    def reject_blank_message_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message text cannot be blank")
        return value


class DraftMessageRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=1000)
    audience_count: int = Field(default=0, ge=0, le=10000)
    priority: Priority = "NORMAL"
    drive_id: UUID | None = None

    @field_validator("instruction")
    @classmethod
    def reject_blank_instruction(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Instruction must contain at least 3 characters")
        return value


class CreateIssueRequest(BaseModel):
    category: IssueCategory
    description: str = Field(min_length=1, max_length=4000)
    organization_id: UUID | None = None

    @field_validator("description")
    @classmethod
    def reject_blank_description(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Description cannot be blank")
        return value


class RespondIssueRequest(BaseModel):
    status: IssueStatus
    response: str = Field(min_length=1, max_length=4000)

    @field_validator("response")
    @classmethod
    def reject_blank_response(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Response cannot be blank")
        return value


def _unknown_template_variables(*templates: str) -> list[str]:
    found = {variable for template in templates for variable in _TEMPLATE_RE.findall(template)}
    return sorted(found - _KNOWN_TEMPLATE_VARIABLES)


def _render_template(template: str, context: dict[str, str | None]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        return value if value else "[not available]"

    return _TEMPLATE_RE.sub(replace, template)


async def _active_memberships(conn, user_id: str, organization_id: UUID | None = None):
    if organization_id:
        return await conn.fetch(
            """SELECT organization_id FROM organization_students
               WHERE user_id = $1 AND organization_id = $2 AND status = 'active'""",
            user_id,
            organization_id,
        )
    return await conn.fetch(
        """SELECT organization_id FROM organization_students
           WHERE user_id = $1 AND status = 'active' ORDER BY added_at DESC""",
        user_id,
    )


@router.get("/messages")
async def list_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM org_communications WHERE organization_id = $1",
            org_id,
        )
        rows = await conn.fetch(
            """SELECT oc.*,
                      COUNT(ocr.id) AS recipient_count,
                      COUNT(ocr.id) FILTER (WHERE ocr.delivery_status = 'DELIVERED') AS delivered_count,
                      COUNT(ocr.id) FILTER (WHERE ocr.delivery_status = 'FAILED') AS failed_count,
                      COUNT(ocr.id) FILTER (WHERE ocr.opened_at IS NOT NULL) AS opened_count,
                      COUNT(ocr.id) FILTER (WHERE ocr.acknowledged_at IS NOT NULL) AS acknowledged_count,
                      pd.company_name, pd.role
               FROM org_communications oc
               LEFT JOIN org_communication_recipients ocr ON ocr.message_id = oc.id
               LEFT JOIN placement_drives pd ON pd.id = oc.drive_id
               WHERE oc.organization_id = $1
               GROUP BY oc.id, pd.company_name, pd.role
               ORDER BY oc.sent_at DESC
               LIMIT $2 OFFSET $3""",
            org_id,
            page_size,
            (page - 1) * page_size,
        )
    return {"items": [dict(row) for row in rows], "total": int(total or 0), "page": page, "page_size": page_size}


@router.post("/messages", status_code=201)
async def send_message(
    body: SendMessageRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    subject = body.subject.strip()
    message_body = body.body.strip()
    unknown_variables = _unknown_template_variables(subject, message_body)
    if unknown_variables:
        raise HTTPException(422, f"Unknown template variables: {', '.join(unknown_variables)}")

    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            if body.drive_id:
                drive_exists = await conn.fetchval(
                    "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2",
                    body.drive_id,
                    org_id,
                )
                if not drive_exists:
                    raise HTTPException(422, "Drive does not belong to this organization")

            clauses = ["os.organization_id = $1", "os.status = 'active'"]
            params: list = [org_id]
            # Explicit students and departments form a union. Treating them as
            # an intersection silently excluded directly selected students from
            # other departments.
            audience_clauses: list[str] = []
            if not body.audience.all_active and body.audience.student_ids:
                params.append(list(dict.fromkeys(body.audience.student_ids)))
                audience_clauses.append(f"os.user_id = ANY(${len(params)}::uuid[])")
            if not body.audience.all_active and body.audience.department_ids:
                params.append(list(dict.fromkeys(body.audience.department_ids)))
                audience_clauses.append(f"os.department_id = ANY(${len(params)}::uuid[])")
            if audience_clauses:
                clauses.append(f"({' OR '.join(audience_clauses)})")

            recipients = await conn.fetch(
                f"""SELECT DISTINCT os.user_id
                    FROM organization_students os
                    WHERE {' AND '.join(clauses)}
                    ORDER BY os.user_id""",
                *params,
            )
            if not recipients:
                raise HTTPException(422, "The selected audience has no active students")
            if len(recipients) > 10000:
                raise HTTPException(422, "Audience exceeds the 10,000-recipient safety limit")

            audience_filter = {
                "all_active": body.audience.all_active,
                "student_ids": [str(value) for value in body.audience.student_ids],
                "department_ids": [str(value) for value in body.audience.department_ids],
            }
            message = await conn.fetchrow(
                """INSERT INTO org_communications
                   (organization_id, message_type, subject_template, body_template,
                    priority, requires_ack, drive_id, audience_filter, audience_count, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                   RETURNING *""",
                org_id,
                body.message_type,
                subject,
                message_body,
                body.priority,
                body.requires_ack,
                body.drive_id,
                json.dumps(audience_filter),
                len(recipients),
                admin.user_id,
            )
            await conn.executemany(
                """INSERT INTO org_communication_recipients
                   (message_id, student_id, delivery_status, delivered_at)
                   VALUES ($1, $2, 'DELIVERED', now())""",
                [(message["id"], recipient["user_id"]) for recipient in recipients],
            )

    return {"message": dict(message), "recipient_count": len(recipients)}


@router.post("/draft")
async def draft_message(
    body: DraftMessageRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    facts: dict[str, object] = {
        "organization": admin.organization_name,
        "audience_count": body.audience_count,
        "priority": body.priority,
    }
    if body.drive_id:
        async with DatabaseConnection() as conn:
            drive = await conn.fetchrow(
                """SELECT title, company_name, role FROM placement_drives
                   WHERE id = $1 AND organization_id = $2""",
                body.drive_id,
                admin.organization_id,
            )
        if not drive:
            raise HTTPException(422, "Drive does not belong to this organization")
        facts["drive"] = dict(drive)

    try:
        draft = await call_llm_json(
            [
                {
                    "role": "system",
                    "content": (
                        "Draft a concise, professional college placement-office in-app message. "
                        "Use only supplied facts; never invent dates, compensation, links, outcomes, or policies. "
                        "Return JSON with string keys subject and body. You may use {{student_name}}."
                    ),
                },
                {"role": "user", "content": json.dumps({"instruction": body.instruction, "facts": facts})},
            ],
            temperature=0.2,
            max_tokens=500,
            retries=2,
        )
    except Exception as exc:
        raise HTTPException(503, "The drafting assistant is temporarily unavailable") from exc

    subject = str(draft.get("subject") or "").strip()[:300]
    message_body = str(draft.get("body") or "").strip()[:10000]
    if not subject or not message_body or _unknown_template_variables(subject, message_body):
        raise HTTPException(502, "The drafting assistant returned an invalid draft")
    return {"subject": subject, "body": message_body}


@router.get("/issues")
async def list_issues(
    status: IssueStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    params: list = [admin.organization_id]
    where = ["oci.organization_id = $1"]
    if status:
        params.append(status)
        where.append(f"oci.status = ${len(params)}")
    async with DatabaseConnection() as conn:
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM org_communication_issues oci WHERE {' AND '.join(where)}",
            *params,
        )
        rows = await conn.fetch(
            f"""SELECT oci.*, p.full_name AS student_name, p.email AS student_email,
                       os.student_code, cd.department_name
                FROM org_communication_issues oci
                JOIN profiles p ON p.id = oci.student_id
                LEFT JOIN organization_students os
                  ON os.user_id = oci.student_id AND os.organization_id = oci.organization_id
                LEFT JOIN college_departments cd ON cd.id = os.department_id
                WHERE {' AND '.join(where)}
                ORDER BY CASE oci.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
                         oci.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}""",
            *params,
            page_size,
            (page - 1) * page_size,
        )
    return {"items": [dict(row) for row in rows], "total": int(total or 0), "page": page, "page_size": page_size}


@router.post("/issues/{issue_id:uuid}/respond")
async def respond_to_issue(
    issue_id: UUID,
    body: RespondIssueRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """UPDATE org_communication_issues
               SET status = $1, response = $2, responded_by = $3,
                   updated_at = now(),
                   resolved_at = CASE WHEN $1 IN ('RESOLVED','CLOSED') THEN now() ELSE NULL END
               WHERE id = $4 AND organization_id = $5
               RETURNING *""",
            body.status,
            body.response.strip(),
            admin.user_id,
            issue_id,
            admin.organization_id,
        )
    if not row:
        raise HTTPException(404, "Issue not found")
    return dict(row)


@router.get("/memberships")
async def list_my_communication_memberships(
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT os.organization_id, o.name AS organization_name
               FROM organization_students os
               JOIN organizations o ON o.id = os.organization_id
               WHERE os.user_id = $1 AND os.status = 'active'
               ORDER BY o.name""",
            current_user.id,
        )
    return {"items": [dict(row) for row in rows]}


@router.get("/inbox")
async def get_inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT oc.id, oc.organization_id, o.name AS organization_name,
                      oc.message_type, oc.subject_template, oc.body_template,
                      oc.priority, oc.requires_ack, oc.sent_at,
                      ocr.delivery_status, ocr.opened_at, ocr.acknowledged_at,
                      pd.title AS drive_name, pd.company_name, pd.role,
                      p.full_name AS student_name
               FROM org_communication_recipients ocr
               JOIN org_communications oc ON oc.id = ocr.message_id
               JOIN organizations o ON o.id = oc.organization_id
               JOIN profiles p ON p.id = ocr.student_id
               JOIN organization_students os
                 ON os.organization_id = oc.organization_id
                AND os.user_id = ocr.student_id AND os.status = 'active'
               LEFT JOIN placement_drives pd ON pd.id = oc.drive_id
               WHERE ocr.student_id = $1 AND ocr.delivery_status = 'DELIVERED'
               ORDER BY oc.sent_at DESC
               LIMIT $2 OFFSET $3""",
            current_user.id,
            page_size,
            (page - 1) * page_size,
        )

    items = []
    for row in rows:
        full_name = str(row["student_name"] or "").strip()
        first_name = full_name.split()[0] if full_name else "Student"
        context = {
            "student_name": first_name,
            "company_name": row["company_name"],
            "role": row["role"],
            "drive_name": row["drive_name"],
        }
        item = dict(row)
        item.pop("student_name", None)
        item["subject"] = _render_template(item.pop("subject_template"), context)
        item["body"] = _render_template(item.pop("body_template"), context)
        items.append(item)
    return {"items": items, "page": page, "page_size": page_size}


@router.post("/inbox/{message_id:uuid}/open")
async def mark_opened(
    message_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        result = await conn.execute(
            """UPDATE org_communication_recipients
               SET opened_at = COALESCE(opened_at, now())
               WHERE message_id = $1 AND student_id = $2 AND delivery_status = 'DELIVERED'""",
            message_id,
            current_user.id,
        )
    if result == "UPDATE 0":
        raise HTTPException(404, "Message not found")
    return {"ok": True}


@router.post("/inbox/{message_id:uuid}/acknowledge")
async def acknowledge_message(
    message_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """UPDATE org_communication_recipients ocr
               SET opened_at = COALESCE(ocr.opened_at, now()),
                   acknowledged_at = COALESCE(ocr.acknowledged_at, now())
               FROM org_communications oc
               WHERE ocr.message_id = $1 AND ocr.student_id = $2
                 AND oc.id = ocr.message_id AND oc.requires_ack = TRUE
               RETURNING ocr.message_id""",
            message_id,
            current_user.id,
        )
    if not row:
        raise HTTPException(404, "Acknowledgement is not required or the message was not found")
    return {"ok": True}


@router.post("/issues/mine", status_code=201)
async def create_my_issue(
    body: CreateIssueRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        memberships = await _active_memberships(conn, current_user.id, body.organization_id)
        if not memberships:
            raise HTTPException(403, "No active college membership was found")
        if len(memberships) > 1 and not body.organization_id:
            raise HTTPException(422, "organization_id is required when more than one college membership is active")
        organization_id = memberships[0]["organization_id"]
        row = await conn.fetchrow(
            """INSERT INTO org_communication_issues
               (organization_id, student_id, category, priority, description)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            organization_id,
            current_user.id,
            body.category,
            _ISSUE_PRIORITY[body.category],
            body.description.strip(),
        )
    return dict(row)


@router.get("/issues/mine")
async def list_my_issues(
    current_user: UserProfile = Depends(get_current_user),
):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT * FROM org_communication_issues
               WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100""",
            current_user.id,
        )
    return {"items": [dict(row) for row in rows]}
