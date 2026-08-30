import json
from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

import httpx
from asyncpg import UniqueViolationError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, field_validator, model_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin
from app.config import get_settings
from app.services.offer_document_storage import (
    delete_offer_document,
    offer_document_path,
    sign_offer_document,
    upload_offer_document,
)

router = APIRouter()

OfferStatus = Literal[
    "DRAFT", "RECEIVED", "UNDER_VERIFICATION", "VERIFIED", "PUBLISHED",
    "ACCEPTANCE_PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN", "CANCELLED",
]
JoiningStatus = Literal["PENDING", "CONFIRMED", "UNVERIFIED", "JOINED", "DELAYED", "DID_NOT_JOIN", "CANCELLED"]

OFFER_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"RECEIVED", "CANCELLED"},
    "RECEIVED": {"UNDER_VERIFICATION", "CANCELLED"},
    "UNDER_VERIFICATION": {"RECEIVED", "VERIFIED", "CANCELLED"},
    "VERIFIED": {"PUBLISHED", "CANCELLED"},
    "PUBLISHED": {"ACCEPTANCE_PENDING", "WITHDRAWN", "CANCELLED"},
    "ACCEPTANCE_PENDING": {"ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN", "CANCELLED"},
    "ACCEPTED": {"WITHDRAWN", "CANCELLED"},
    "DECLINED": set(),
    "EXPIRED": set(),
    "WITHDRAWN": set(),
    "CANCELLED": set(),
}

JOINING_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"CONFIRMED", "UNVERIFIED", "DELAYED", "DID_NOT_JOIN", "CANCELLED"},
    "UNVERIFIED": {"CONFIRMED", "JOINED", "DELAYED", "DID_NOT_JOIN", "CANCELLED"},
    "CONFIRMED": {"JOINED", "DELAYED", "DID_NOT_JOIN", "CANCELLED"},
    "DELAYED": {"CONFIRMED", "JOINED", "DID_NOT_JOIN", "CANCELLED"},
    "JOINED": set(),
    "DID_NOT_JOIN": set(),
    "CANCELLED": set(),
}


class CreateOfferRequest(BaseModel):
    season_id: UUID
    student_id: UUID
    drive_id: UUID
    company_id: UUID
    role_title: str = Field(min_length=1, max_length=200)
    employment_type: Literal["FULL_TIME", "INTERNSHIP", "INTERN_TO_FULL_TIME", "CONTRACT", "OTHER"]
    work_mode: Literal["ONSITE", "REMOTE", "HYBRID"]
    location: str = Field(min_length=1, max_length=300)
    offer_date: date
    acceptance_deadline: datetime
    joining_date: date
    currency: str = Field(default="INR", min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    ctc_total_minor: int = Field(ge=0)
    ctc_fixed_minor: int = Field(ge=0)
    ctc_variable_minor: int | None = Field(default=None, ge=0)
    stipend_minor: int | None = Field(default=None, ge=0)
    probation_info: str | None = Field(default=None, max_length=2000)
    source: Literal["TPO_ENTERED", "IMPORTED", "ADMIN_IMPORTED", "DOCUMENT_EXTRACTED", "OTHER_APPROVED_SOURCE"] = "TPO_ENTERED"
    has_final_selection: bool = True

    @field_validator("role_title", "location")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("acceptance_deadline")
    @classmethod
    def require_deadline_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("acceptance_deadline must include a timezone offset")
        return value

    @model_validator(mode="after")
    def validate_dates_and_compensation(self) -> "CreateOfferRequest":
        if self.joining_date < self.offer_date:
            raise ValueError("joining_date cannot be before offer_date")
        if self.acceptance_deadline.date() < self.offer_date:
            raise ValueError("acceptance_deadline cannot be before offer_date")
        if self.ctc_fixed_minor > self.ctc_total_minor:
            raise ValueError("ctc_fixed_minor cannot exceed ctc_total_minor")
        return self


class TransitionOfferRequest(BaseModel):
    to_status: OfferStatus
    reason: str | None = Field(default=None, max_length=1000)


class UpdateJoiningRequest(BaseModel):
    to_status: JoiningStatus
    confirmed_joining_date: date | None = None
    evidence_document_id: UUID | None = None
    remarks: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_joining_fields(self) -> "UpdateJoiningRequest":
        if self.to_status == "DID_NOT_JOIN" and not (self.reason and self.reason.strip()):
            raise ValueError("reason is required for DID_NOT_JOIN")
        return self


class CreatePlacementSeasonRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date

    @field_validator("name")
    @classmethod
    def strip_season_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("season name must not be blank")
        return value

    @model_validator(mode="after")
    def validate_season_dates(self) -> "CreatePlacementSeasonRequest":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on cannot be before starts_on")
        return self


def _json_snapshot(row) -> str:
    return json.dumps(dict(row), default=str)


async def _append_offer_version(conn, row, actor_id: str, reason: str | None) -> None:
    await conn.execute(
        """INSERT INTO offer_versions
           (id, offer_id, version_number, snapshot, reason, changed_by, source)
           VALUES ($1,$2,$3,$4,$5,$6,'TPO_API')""",
        uuid4(), row["id"], row["current_version"], _json_snapshot(row), reason, UUID(actor_id),
    )


async def _write_offer_audit(conn, admin: OrgAdminProfile, action: str, offer_id: UUID, old_value=None, new_value=None) -> None:
    await conn.execute(
        """INSERT INTO audit_log
           (id, institution_id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
           VALUES ($1,$2,$3,$4,$5,'offer',$6,$7,$8)""",
        uuid4(), UUID(admin.organization_id), admin.user_id, admin.admin_role, action, str(offer_id),
        json.dumps(old_value, default=str) if old_value is not None else None,
        json.dumps(new_value, default=str) if new_value is not None else None,
    )


async def _refresh_placement_outcome(conn, student_id: UUID, season_id: UUID, actor_id: str) -> None:
    """Derive one current outcome from all offers using deterministic precedence."""
    candidate = await conn.fetchrow(
        """SELECT o.id AS offer_id, o.status AS offer_status, j.status AS joining_status,
                  CASE
                    WHEN j.status = 'JOINED' THEN 1
                    WHEN o.status = 'ACCEPTED' AND COALESCE(j.status, 'PENDING') NOT IN ('DID_NOT_JOIN','CANCELLED') THEN 2
                    WHEN j.status = 'DID_NOT_JOIN' THEN 3
                    WHEN o.status = 'DECLINED' THEN 4
                    WHEN o.status = 'EXPIRED' THEN 5
                    ELSE 99
                  END AS precedence
           FROM offers o
           LEFT JOIN joining_records j ON j.offer_id = o.id
           WHERE o.student_id = $1 AND o.season_id = $2
           ORDER BY precedence, o.updated_at DESC
           LIMIT 1""",
        student_id, season_id,
    )
    if not candidate or candidate["precedence"] == 99:
        await conn.execute(
            "DELETE FROM student_placement_outcomes WHERE student_id = $1 AND season_id = $2 AND source = 'DERIVED'",
            student_id, season_id,
        )
        return

    outcome = {
        1: "PLACED_JOINED",
        2: "PLACED_OFFER_ACCEPTED_JOINING_PENDING",
        3: "DID_NOT_JOIN",
        4: "OFFER_DECLINED",
        5: "OFFER_EXPIRED",
    }[candidate["precedence"]]
    await conn.execute(
        """INSERT INTO student_placement_outcomes
           (id, student_id, season_id, offer_id, outcome, verified, verified_by, verified_at, source)
           VALUES ($1,$2,$3,$4,$5,TRUE,$6,now(),'DERIVED')
           ON CONFLICT (student_id, season_id) DO UPDATE
           SET offer_id = EXCLUDED.offer_id, outcome = EXCLUDED.outcome,
               verified = TRUE, verified_by = EXCLUDED.verified_by,
               verified_at = EXCLUDED.verified_at, source = EXCLUDED.source, updated_at = now()
           WHERE student_placement_outcomes.source = 'DERIVED'""",
        uuid4(), student_id, season_id, candidate["offer_id"], outcome, actor_id,
    )


@router.get("/seasons")
async def list_placement_seasons(
    include_closed: bool = Query(False),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT * FROM placement_seasons
               WHERE organization_id = $1 AND ($2::boolean OR status = 'ACTIVE')
               ORDER BY starts_on DESC, name""",
            admin.organization_id, include_closed,
        )
    return {"items": [dict(row) for row in rows]}


@router.post("/seasons", status_code=201)
async def create_placement_season(
    body: CreatePlacementSeasonRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    try:
        async with DatabaseConnection() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """INSERT INTO placement_seasons
                       (organization_id, name, starts_on, ends_on, created_by)
                       VALUES ($1,$2,$3,$4,$5) RETURNING *""",
                    admin.organization_id, body.name, body.starts_on, body.ends_on, admin.user_id,
                )
                await conn.execute(
                    """INSERT INTO audit_log
                       (id, institution_id, actor_id, actor_role, action, entity_type, entity_id, new_value)
                       VALUES ($1,$2,$3,$4,'PLACEMENT_SEASON_CREATED','placement_season',$5,$6)""",
                    uuid4(), admin.organization_id, admin.user_id, admin.admin_role,
                    str(row["id"]), _json_snapshot(row),
                )
        return dict(row)
    except UniqueViolationError as exc:
        raise HTTPException(409, "A placement season with this name already exists") from exc


@router.post("/seasons/{season_id:uuid}/close")
async def close_placement_season(
    season_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            season = await conn.fetchrow(
                """SELECT status FROM placement_seasons
                   WHERE id = $1 AND organization_id = $2 FOR UPDATE""",
                season_id, admin.organization_id,
            )
            if not season:
                raise HTTPException(404, "Placement season not found")
            if season["status"] == "CLOSED":
                return {"id": str(season_id), "status": "CLOSED", "idempotent": True}
            await conn.execute(
                "UPDATE placement_seasons SET status = 'CLOSED', updated_at = now() WHERE id = $1",
                season_id,
            )
            await conn.execute(
                """INSERT INTO audit_log
                   (id, institution_id, actor_id, actor_role, action, entity_type, entity_id, new_value)
                   VALUES ($1,$2,$3,$4,'PLACEMENT_SEASON_CLOSED','placement_season',$5,$6)""",
                uuid4(), admin.organization_id, admin.user_id, admin.admin_role,
                str(season_id), json.dumps({"status": "CLOSED"}),
            )
    return {"id": str(season_id), "status": "CLOSED"}


@router.get("")
async def list_offers(
    status: OfferStatus | None = Query(None),
    search: str | None = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    conditions = ["o.institution_id = $1"]
    params: list = [admin.organization_id]
    if status:
        params.append(status)
        conditions.append(f"o.status = ${len(params)}")
    if search and search.strip():
        params.append(f"%{search.strip()}%")
        conditions.append(
            f"(p.full_name ILIKE ${len(params)} OR p.email ILIKE ${len(params)} "
            f"OR o.role_title ILIKE ${len(params)} OR rc.name ILIKE ${len(params)})"
        )
    where = " AND ".join(conditions)
    offset = (page - 1) * page_size
    async with DatabaseConnection() as conn:
        total = await conn.fetchval(
            f"""SELECT COUNT(*) FROM offers o
                JOIN profiles p ON p.id = o.student_id
                JOIN recruiter_companies rc ON rc.id = o.company_id
                WHERE {where}""",
            *params,
        )
        params.extend([page_size, offset])
        rows = await conn.fetch(
            f"""SELECT o.*, p.full_name AS student_name, p.email AS student_email,
                       rc.name AS company_name, j.status AS joining_status
                FROM offers o
                JOIN profiles p ON p.id = o.student_id
                JOIN recruiter_companies rc ON rc.id = o.company_id
                LEFT JOIN joining_records j ON j.offer_id = o.id
                WHERE {where}
                ORDER BY o.updated_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}""",
            *params,
        )
    return {"items": [dict(row) for row in rows], "total": int(total or 0), "page": page, "page_size": page_size}


@router.post("", status_code=201)
async def create_offer(
    body: CreateOfferRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    offer_id = uuid4()
    try:
        async with DatabaseConnection() as conn:
            async with conn.transaction():
                student_exists = await conn.fetchval(
                    """SELECT 1 FROM organization_students
                       WHERE organization_id = $1 AND user_id = $2 AND status = 'active'""",
                    admin.organization_id, body.student_id,
                )
                if not student_exists:
                    raise HTTPException(422, "Student is not active in this organization")
                season_exists = await conn.fetchval(
                    """SELECT 1 FROM placement_seasons
                       WHERE organization_id = $1 AND id = $2 AND status = 'ACTIVE'""",
                    admin.organization_id, body.season_id,
                )
                if not season_exists:
                    raise HTTPException(422, "Placement season is not active for this organization")
                company_exists = await conn.fetchval(
                    """SELECT 1 FROM recruiter_companies
                       WHERE organization_id = $1 AND id = $2 AND status = 'ACTIVE'""",
                    admin.organization_id, body.company_id,
                )
                if not company_exists:
                    raise HTTPException(422, "Recruiter company is not active in this organization")
                drive = await conn.fetchrow(
                    "SELECT company_id FROM placement_drives WHERE organization_id = $1 AND id = $2",
                    admin.organization_id, body.drive_id,
                )
                if not drive:
                    raise HTTPException(422, "Placement drive does not belong to this organization")
                if drive["company_id"] and drive["company_id"] != body.company_id:
                    raise HTTPException(422, "Offer company does not match the placement drive company")

                duplicate = await conn.fetchval(
                    """SELECT 1 FROM offers
                       WHERE student_id = $1 AND company_id = $2 AND drive_id = $3
                         AND status NOT IN ('DECLINED','EXPIRED','WITHDRAWN','CANCELLED')""",
                    body.student_id, body.company_id, body.drive_id,
                )
                if duplicate:
                    raise HTTPException(409, "An active offer already exists for this student, company, and drive")

                row = await conn.fetchrow(
                    """INSERT INTO offers
                       (id, institution_id, season_id, student_id, drive_id, company_id,
                        role_title, employment_type, work_mode, location, offer_date,
                        acceptance_deadline, joining_date, currency, ctc_total_minor,
                        ctc_fixed_minor, ctc_variable_minor, stipend_minor, probation_info,
                        status, source, has_final_selection)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'RECEIVED',$20,$21)
                       RETURNING *""",
                    offer_id, admin.organization_id, body.season_id, body.student_id,
                    body.drive_id, body.company_id, body.role_title, body.employment_type,
                    body.work_mode, body.location, body.offer_date, body.acceptance_deadline,
                    body.joining_date, body.currency, body.ctc_total_minor, body.ctc_fixed_minor,
                    body.ctc_variable_minor, body.stipend_minor, body.probation_info,
                    body.source, body.has_final_selection,
                )
                await _append_offer_version(conn, row, admin.user_id, "Offer created")
                await _write_offer_audit(conn, admin, "OFFER_CREATED", offer_id, new_value=dict(row))
        return dict(row)
    except UniqueViolationError as exc:
        raise HTTPException(409, "An active offer already exists for this student, company, and drive") from exc


@router.get("/{offer_id:uuid}")
async def get_offer(
    offer_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        offer = await conn.fetchrow(
            """SELECT o.*, p.full_name AS student_name, p.email AS student_email,
                      rc.name AS company_name, pd.title AS drive_title
               FROM offers o
               JOIN profiles p ON p.id = o.student_id
               JOIN recruiter_companies rc ON rc.id = o.company_id
               JOIN placement_drives pd ON pd.id = o.drive_id
               WHERE o.id = $1 AND o.institution_id = $2""",
            offer_id, admin.organization_id,
        )
        if not offer:
            raise HTTPException(404, "Offer not found")
        versions = await conn.fetch(
            "SELECT * FROM offer_versions WHERE offer_id = $1 ORDER BY version_number DESC",
            offer_id,
        )
        joining = await conn.fetchrow("SELECT * FROM joining_records WHERE offer_id = $1", offer_id)
        documents = await conn.fetch(
            """SELECT id, document_type, verification_status, uploaded_at
               FROM offer_documents WHERE offer_id = $1 ORDER BY uploaded_at DESC""",
            offer_id,
        )
    return {
        "offer": dict(offer),
        "versions": [dict(row) for row in versions],
        "joining": dict(joining) if joining else None,
        "documents": [dict(row) for row in documents],
        "legal_next_states": sorted(OFFER_TRANSITIONS.get(offer["status"], set())),
        "legal_joining_states": sorted(JOINING_TRANSITIONS.get(joining["status"], set())) if joining else [],
    }


@router.post("/{offer_id:uuid}/status")
async def transition_offer(
    offer_id: UUID,
    body: TransitionOfferRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            offer = await conn.fetchrow(
                "SELECT * FROM offers WHERE id = $1 AND institution_id = $2 FOR UPDATE",
                offer_id, admin.organization_id,
            )
            if not offer:
                raise HTTPException(404, "Offer not found")
            old_status = offer["status"]
            if body.to_status == old_status:
                return {"id": str(offer_id), "status": old_status, "idempotent": True}
            if body.to_status not in OFFER_TRANSITIONS.get(old_status, set()):
                raise HTTPException(422, f"Cannot transition offer from {old_status} to {body.to_status}")
            if body.to_status == "VERIFIED" and not offer["has_final_selection"]:
                raise HTTPException(422, "Final selection evidence is required before verification")
            if body.to_status == "VERIFIED":
                verified_document = await conn.fetchval(
                    """SELECT 1 FROM offer_documents
                       WHERE offer_id = $1
                         AND document_type IN ('OFFER_LETTER','APPOINTMENT_DOCUMENT','EMPLOYMENT_CONFIRMATION')
                         AND verification_status = 'VERIFIED'
                       LIMIT 1""",
                    offer_id,
                )
                if not verified_document:
                    raise HTTPException(422, "A verified offer or appointment document is required")
            if body.to_status == "ACCEPTANCE_PENDING" and offer["acceptance_deadline"] <= datetime.now(timezone.utc):
                raise HTTPException(422, "The acceptance deadline has already passed")
            if body.to_status == "ACCEPTED" and offer["acceptance_deadline"] <= datetime.now(timezone.utc):
                raise HTTPException(422, "The acceptance deadline has passed; expire the offer instead")

            verification_status = offer["verification_status"]
            if body.to_status == "UNDER_VERIFICATION":
                verification_status = "IN_PROGRESS"
            elif body.to_status == "VERIFIED":
                verification_status = "VERIFIED"
            row = await conn.fetchrow(
                """UPDATE offers
                   SET status = $1, verification_status = $2,
                       current_version = current_version + 1, updated_at = now()
                   WHERE id = $3 RETURNING *""",
                body.to_status, verification_status, offer_id,
            )
            await _append_offer_version(conn, row, admin.user_id, body.reason)

            if body.to_status == "ACCEPTED":
                await conn.execute(
                    """INSERT INTO joining_records
                       (id, offer_id, student_id, expected_joining_date)
                       VALUES ($1,$2,$3,$4)
                       ON CONFLICT (offer_id) DO NOTHING""",
                    uuid4(), offer_id, offer["student_id"], offer["joining_date"],
                )
            if body.to_status in {"WITHDRAWN", "CANCELLED"}:
                await conn.execute(
                    """UPDATE joining_records SET status = 'CANCELLED', updated_at = now()
                       WHERE offer_id = $1 AND status NOT IN ('JOINED','DID_NOT_JOIN','CANCELLED')""",
                    offer_id,
                )
            await _refresh_placement_outcome(conn, offer["student_id"], offer["season_id"], admin.user_id)
            await _write_offer_audit(
                conn, admin, "OFFER_STATUS_CHANGED", offer_id,
                old_value={"status": old_status}, new_value={"status": body.to_status, "reason": body.reason},
            )
    return {"id": str(offer_id), "status": body.to_status}


@router.post("/{offer_id:uuid}/joining")
async def update_joining(
    offer_id: UUID,
    body: UpdateJoiningRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            joining = await conn.fetchrow(
                """SELECT j.*, o.institution_id, o.season_id
                   FROM joining_records j JOIN offers o ON o.id = j.offer_id
                   WHERE j.offer_id = $1 AND o.institution_id = $2 FOR UPDATE OF j""",
                offer_id, admin.organization_id,
            )
            if not joining:
                raise HTTPException(404, "Joining record not found; the offer must be accepted first")
            old_status = joining["status"]
            if body.to_status == old_status:
                return {"offer_id": str(offer_id), "status": old_status, "idempotent": True}
            if body.to_status not in JOINING_TRANSITIONS.get(old_status, set()):
                raise HTTPException(422, f"Cannot transition joining from {old_status} to {body.to_status}")
            evidence_document_id = body.evidence_document_id or joining["evidence_document_id"]
            if body.to_status == "JOINED":
                evidence_verified = await conn.fetchval(
                    """SELECT 1 FROM offer_documents
                       WHERE id = $1 AND offer_id = $2 AND verification_status = 'VERIFIED'""",
                    evidence_document_id, offer_id,
                ) if evidence_document_id else None
                if not evidence_verified:
                    raise HTTPException(422, "Verified joining evidence is required before marking the student joined")

            verified_by = admin.user_id if body.to_status == "JOINED" else joining["verified_by"]
            verified_at = datetime.now(timezone.utc) if body.to_status == "JOINED" else joining["verified_at"]
            confirmed_date = body.confirmed_joining_date
            if body.to_status == "JOINED" and confirmed_date is None:
                confirmed_date = date.today()
            row = await conn.fetchrow(
                """UPDATE joining_records
                   SET status = $1, confirmed_joining_date = COALESCE($2, confirmed_joining_date),
                       evidence_document_id = COALESCE($3, evidence_document_id),
                       verified_by = $4, verified_at = $5, remarks = $6, reason = $7,
                       updated_at = now()
                   WHERE offer_id = $8 RETURNING *""",
                body.to_status, confirmed_date, evidence_document_id, verified_by,
                verified_at, body.remarks, body.reason, offer_id,
            )
            await _refresh_placement_outcome(conn, joining["student_id"], joining["season_id"], admin.user_id)
            await _write_offer_audit(
                conn, admin, "JOINING_STATUS_CHANGED", offer_id,
                old_value={"status": old_status}, new_value={"status": body.to_status, "reason": body.reason},
            )
    return dict(row)


@router.post("/{offer_id:uuid}/documents", status_code=201)
async def upload_offer_evidence(
    offer_id: UUID,
    document_type: Literal[
        "OFFER_LETTER", "APPOINTMENT_DOCUMENT", "EMPLOYMENT_CONFIRMATION", "JOINING_LETTER", "OTHER"
    ] = Form(...),
    file: UploadFile = File(...),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Upload a PDF to private storage and register immutable offer metadata."""
    filename = (file.filename or "").strip()
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Offer evidence must be a PDF file")
    max_bytes = get_settings().OFFER_DOCUMENT_MAX_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise HTTPException(400, "Offer evidence file is empty")
    if len(content) > max_bytes:
        raise HTTPException(413, f"Offer evidence cannot exceed {get_settings().OFFER_DOCUMENT_MAX_MB} MiB")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(400, "The uploaded file is not a valid PDF")

    async with DatabaseConnection() as conn:
        offer_exists = await conn.fetchval(
            "SELECT 1 FROM offers WHERE id = $1 AND institution_id = $2",
            offer_id, admin.organization_id,
        )
    if not offer_exists:
        raise HTTPException(404, "Offer not found")

    document_id = uuid4()
    object_path = offer_document_path(admin.organization_id, str(offer_id), str(document_id))
    try:
        await upload_offer_document(object_path, content)
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(503, "Offer evidence storage is temporarily unavailable") from exc

    try:
        async with DatabaseConnection() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """INSERT INTO offer_documents
                       (id, offer_id, document_type, document_ref_id, uploaded_by)
                       VALUES ($1,$2,$3,$1,$4) RETURNING id, document_type, verification_status, uploaded_at""",
                    document_id, offer_id, document_type, admin.user_id,
                )
                await _write_offer_audit(
                    conn, admin, "OFFER_DOCUMENT_UPLOADED", offer_id,
                    new_value={"document_id": str(document_id), "document_type": document_type},
                )
    except Exception:
        await delete_offer_document(object_path)
        raise
    return dict(row)


@router.post("/{offer_id:uuid}/documents/{document_id:uuid}/verify")
async def verify_offer_evidence(
    offer_id: UUID,
    document_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            document = await conn.fetchrow(
                """SELECT od.verification_status FROM offer_documents od
                   JOIN offers o ON o.id = od.offer_id
                   WHERE od.id = $1 AND od.offer_id = $2 AND o.institution_id = $3
                   FOR UPDATE OF od""",
                document_id, offer_id, admin.organization_id,
            )
            if not document:
                raise HTTPException(404, "Offer document not found")
            if document["verification_status"] == "VERIFIED":
                return {"id": str(document_id), "verification_status": "VERIFIED", "idempotent": True}
            await conn.execute(
                "UPDATE offer_documents SET verification_status = 'VERIFIED' WHERE id = $1",
                document_id,
            )
            await _write_offer_audit(
                conn, admin, "OFFER_DOCUMENT_VERIFIED", offer_id,
                old_value={"verification_status": document["verification_status"]},
                new_value={"verification_status": "VERIFIED", "document_id": str(document_id)},
            )
    return {"id": str(document_id), "verification_status": "VERIFIED"}


@router.get("/{offer_id:uuid}/documents/{document_id:uuid}/download")
async def get_offer_evidence_download(
    offer_id: UUID,
    document_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        exists = await conn.fetchval(
            """SELECT 1 FROM offer_documents od JOIN offers o ON o.id = od.offer_id
               WHERE od.id = $1 AND od.offer_id = $2 AND o.institution_id = $3""",
            document_id, offer_id, admin.organization_id,
        )
    if not exists:
        raise HTTPException(404, "Offer document not found")
    object_path = offer_document_path(admin.organization_id, str(offer_id), str(document_id))
    try:
        url = await sign_offer_document(object_path)
    except (httpx.HTTPError, RuntimeError) as exc:
        raise HTTPException(503, "Offer evidence storage is temporarily unavailable") from exc
    return {"url": url, "expires_in": 900}

@router.get("/analytics/summary")
async def get_offers_summary(
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        offer_row = await conn.fetchrow(
            """SELECT
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status IN (
                       'VERIFIED','PUBLISHED','ACCEPTANCE_PENDING','ACCEPTED','DECLINED','EXPIRED'
                   )) AS verified,
                   COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
                   COUNT(*) FILTER (WHERE status = 'ACCEPTANCE_PENDING') AS pending,
                   COUNT(*) FILTER (WHERE status = 'DECLINED') AS declined,
                   COUNT(*) FILTER (
                       WHERE status = 'ACCEPTANCE_PENDING'
                         AND acceptance_deadline >= now()
                         AND acceptance_deadline < now() + interval '7 days'
                   ) AS expiring_soon
               FROM offers
               WHERE institution_id = $1""",
            org_id,
        )
        joining_row = await conn.fetchrow(
            """SELECT
                   COUNT(*) FILTER (WHERE j.status IN ('CONFIRMED', 'JOINED')) AS confirmed,
                   COUNT(*) FILTER (WHERE j.status IN ('PENDING', 'UNVERIFIED')) AS pending,
                   COUNT(*) FILTER (WHERE j.status = 'DELAYED') AS delayed,
                   COUNT(*) FILTER (WHERE j.status = 'DID_NOT_JOIN') AS did_not_join
               FROM joining_records j
               JOIN offers o ON o.id = j.offer_id
               WHERE o.institution_id = $1""",
            org_id,
        )

    offer_metrics = {
        "total": int(offer_row["total"] or 0),
        "verified": int(offer_row["verified"] or 0),
        "accepted": int(offer_row["accepted"] or 0),
        "pending": int(offer_row["pending"] or 0),
        "declined": int(offer_row["declined"] or 0),
        "expiringSoon": int(offer_row["expiring_soon"] or 0),
    }
    joining_metrics = {
        "confirmed": int(joining_row["confirmed"] or 0),
        "pending": int(joining_row["pending"] or 0),
        "delayed": int(joining_row["delayed"] or 0),
        "didNotJoin": int(joining_row["did_not_join"] or 0),
    }

    return {
        "offerMetrics": offer_metrics,
        "joiningMetrics": joining_metrics
    }


@router.get("/analytics/insights")
async def get_offers_insights(
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id

    async with DatabaseConnection() as conn:
        funnel_row = await conn.fetchrow(
            """SELECT
                   COUNT(*) FILTER (WHERE status <> 'DRAFT') AS received,
                   COUNT(*) FILTER (WHERE status NOT IN ('DRAFT', 'RECEIVED', 'CANCELLED', 'WITHDRAWN')) AS under_verification,
                   COUNT(*) FILTER (WHERE status IN ('VERIFIED', 'PUBLISHED', 'ACCEPTANCE_PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')) AS verified,
                   COUNT(*) FILTER (WHERE status IN ('PUBLISHED', 'ACCEPTANCE_PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')) AS published,
                   COUNT(*) FILTER (WHERE status IN ('ACCEPTANCE_PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')) AS acceptance_pending,
                   COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted
               FROM offers
               WHERE institution_id = $1""",
            org_id,
        )
        company_rows = await conn.fetch(
            """SELECT
                   o.company_id::text AS company_id,
                   COALESCE(rc.name, pd.company_name, o.company_id::text) AS company_name,
                   COUNT(*) AS offers_extended,
                   COUNT(*) FILTER (WHERE o.status = 'ACCEPTED') AS accepted,
                   COUNT(*) FILTER (WHERE j.status IN ('CONFIRMED', 'JOINED')) AS joined
               FROM offers o
               LEFT JOIN recruiter_companies rc
                 ON rc.id = o.company_id AND rc.organization_id = o.institution_id
               LEFT JOIN placement_drives pd ON pd.id = o.drive_id
               LEFT JOIN joining_records j ON j.offer_id = o.id
               WHERE o.institution_id = $1
               GROUP BY o.company_id, COALESCE(rc.name, pd.company_name, o.company_id::text)
               ORDER BY COUNT(*) DESC, company_name ASC""",
            org_id,
        )
        digest_row = await conn.fetchrow(
            """SELECT
                   (SELECT COUNT(*) FROM offers
                    WHERE institution_id = $1 AND status = 'ACCEPTANCE_PENDING'
                      AND acceptance_deadline::date = CURRENT_DATE) AS expiring_today,
                   (SELECT COUNT(*) FROM offers
                    WHERE institution_id = $1 AND status = 'ACCEPTANCE_PENDING'
                      AND acceptance_deadline < now()) AS overdue_not_expired,
                   (SELECT COUNT(*) FROM offer_documents od
                    JOIN offers o ON o.id = od.offer_id
                    WHERE o.institution_id = $1
                      AND od.verification_status IN ('NOT_STARTED', 'IN_PROGRESS')) AS evidence_awaiting_verification,
                   (SELECT COUNT(*) FROM offers
                    WHERE institution_id = $1 AND status = 'UNDER_VERIFICATION'
                      AND updated_at < now() - interval '3 days') AS stale_in_verification,
                   (SELECT COUNT(*) FROM joining_records j
                    JOIN offers o ON o.id = j.offer_id
                    WHERE o.institution_id = $1
                      AND j.expected_joining_date = CURRENT_DATE
                      AND j.status NOT IN ('DID_NOT_JOIN', 'CANCELLED')) AS joining_today""",
            org_id,
        )

    stage_keys = (
        ("RECEIVED", "received"),
        ("UNDER_VERIFICATION", "under_verification"),
        ("VERIFIED", "verified"),
        ("PUBLISHED", "published"),
        ("ACCEPTANCE_PENDING", "acceptance_pending"),
        ("ACCEPTED", "accepted"),
    )
    funnel = {
        "stageReachedCounts": {
            response_key: int(funnel_row[column] or 0)
            for response_key, column in stage_keys
        }
    }

    company_scorecard = []
    company_name_by_id = {}
    for row in company_rows:
        company_id = row["company_id"]
        offers_extended = int(row["offers_extended"] or 0)
        accepted = int(row["accepted"] or 0)
        joined = int(row["joined"] or 0)
        company_name_by_id[company_id] = row["company_name"]
        company_scorecard.append({
            "companyId": company_id,
            "offersExtended": offers_extended,
            "acceptanceRate": accepted / offers_extended if offers_extended else None,
            "joiningRate": joined / accepted if accepted else None,
        })

    today_digest = {
        "counts": {
            "expiringToday": int(digest_row["expiring_today"] or 0),
            "overdueNotExpired": int(digest_row["overdue_not_expired"] or 0),
            "evidenceAwaitingVerification": int(digest_row["evidence_awaiting_verification"] or 0),
            "staleInVerification": int(digest_row["stale_in_verification"] or 0),
            "joiningToday": int(digest_row["joining_today"] or 0),
        }
    }

    return {
        "funnel": funnel,
        "companyScorecard": company_scorecard,
        "todayDigest": today_digest,
        "companyNameById": company_name_by_id,
    }
