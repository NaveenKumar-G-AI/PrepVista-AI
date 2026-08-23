import math
import uuid

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.application import Application
from app.models.company import Company
from app.models.drive import Drive, DriveStatus, InterviewRound
from app.schemas.drive import (
    DriveCreate,
    DriveDetail,
    DriveListResponse,
    DriveUpdate,
    EligibilityRequest,
    EligibilityResponse,
    InterviewRoundIn,
    InterviewRoundOut,
)
from app.services import activity_service, audit_service, funnel_service

router = APIRouter(prefix="/drives", tags=["drives"])


@router.post("/eligibility-check", response_model=EligibilityResponse)
def check_eligibility(payload: EligibilityRequest, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> EligibilityResponse:
    """Live eligibility preview while a TPO is drafting a drive — no drive needs to exist yet."""
    result = funnel_service.compute_eligibility(
        db, institution_id=tenant_id, min_cgpa=payload.min_cgpa,
        max_backlogs=payload.max_backlogs, department_ids=payload.department_ids,
    )
    return EligibilityResponse(**result)


@router.get("", response_model=DriveListResponse)
def list_drives(
    db: DbSession, tenant_id: TenantId, _: CurrentUser,
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
    status_: DriveStatus | None = Query(None, alias="status"), company_id: uuid.UUID | None = None,
) -> DriveListResponse:
    stmt = select(Drive, Company.name).join(Company, Company.id == Drive.company_id).where(Drive.institution_id == tenant_id)
    count_stmt = select(func.count()).select_from(Drive).where(Drive.institution_id == tenant_id)
    if status_:
        stmt = stmt.where(Drive.status == status_)
        count_stmt = count_stmt.where(Drive.status == status_)
    if company_id:
        stmt = stmt.where(Drive.company_id == company_id)
        count_stmt = count_stmt.where(Drive.company_id == company_id)

    total = db.execute(count_stmt).scalar_one()
    stmt = stmt.order_by(Drive.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()

    items = []
    for drive, company_name in rows:
        applicant_count = db.execute(select(func.count()).where(Application.drive_id == drive.id)).scalar_one()
        items.append({
            "id": drive.id, "company_id": drive.company_id, "company_name": company_name, "role": drive.role,
            "ctc_lpa": drive.ctc_lpa, "location": drive.location, "status": drive.status,
            "application_deadline": drive.application_deadline, "applicant_count": applicant_count,
        })

    return DriveListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=max(1, math.ceil(total / page_size)))


@router.post("", response_model=DriveDetail, status_code=201)
def create_drive(payload: DriveCreate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> DriveDetail:
    company = db.get(Company, payload.company_id)
    if not company or company.institution_id != tenant_id:
        raise NotFoundError("Company not found.")

    drive = Drive(institution_id=tenant_id, **payload.model_dump())
    db.add(drive)
    db.flush()

    activity_service.emit(db, institution_id=tenant_id, entity_type="drive", entity_id=drive.id, event_type="drive.created", actor_user_id=current_user.id)
    audit_service.record(db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="drive", entity_id=drive.id, action="CREATE")
    db.commit()
    db.refresh(drive)
    return DriveDetail(**{**drive.__dict__, "company_name": company.name})


@router.get("/{drive_id}", response_model=DriveDetail)
def get_drive(drive_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> DriveDetail:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    return DriveDetail(**{**drive.__dict__, "company_name": drive.company.name})


@router.patch("/{drive_id}", response_model=DriveDetail)
def update_drive(drive_id: uuid.UUID, payload: DriveUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> DriveDetail:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(drive, field, value)
    db.flush()
    activity_service.emit(db, institution_id=tenant_id, entity_type="drive", entity_id=drive.id, event_type="drive.updated", actor_user_id=current_user.id, metadata={"fields": list(changes.keys())})
    db.commit()
    db.refresh(drive)
    return DriveDetail(**{**drive.__dict__, "company_name": drive.company.name})


@router.get("/{drive_id}/eligible-students")
def get_eligible_students(drive_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> dict:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    ids = funnel_service.get_eligible_student_ids(db, institution_id=tenant_id, drive=drive)
    return {"drive_id": drive_id, "eligible_student_ids": [str(i) for i in ids], "count": len(ids)}


@router.post("/{drive_id}/rounds", response_model=InterviewRoundOut, status_code=201)
def add_round(drive_id: uuid.UUID, payload: InterviewRoundIn, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> InterviewRoundOut:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    round_ = InterviewRound(institution_id=tenant_id, drive_id=drive_id, **payload.model_dump())
    db.add(round_)
    db.flush()
    audit_service.record(db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="interview_round", entity_id=round_.id, action="CREATE")
    db.commit()
    db.refresh(round_)
    return InterviewRoundOut.model_validate(round_)


@router.get("/{drive_id}/rounds", response_model=list[InterviewRoundOut])
def list_rounds(drive_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[InterviewRoundOut]:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    return [InterviewRoundOut.model_validate(r) for r in drive.rounds]
