import math
import uuid

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import ConflictError, NotFoundError
from app.models.application import Application, ApplicationStage
from app.models.company import Company, CompanyContact, PipelineStage
from app.models.drive import Drive
from app.schemas.company import (
    CompanyContactIn,
    CompanyContactOut,
    CompanyCreate,
    CompanyDetail,
    CompanyListResponse,
    CompanyUpdate,
)
from app.services import activity_service, audit_service

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=CompanyListResponse)
def list_companies(
    db: DbSession, tenant_id: TenantId, _: CurrentUser,
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
    search: str | None = None, pipeline_stage: PipelineStage | None = None,
) -> CompanyListResponse:
    stmt = select(Company).where(Company.institution_id == tenant_id)
    count_stmt = select(func.count()).select_from(Company).where(Company.institution_id == tenant_id)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(Company.name.ilike(pattern))
        count_stmt = count_stmt.where(Company.name.ilike(pattern))
    if pipeline_stage:
        stmt = stmt.where(Company.pipeline_stage == pipeline_stage)
        count_stmt = count_stmt.where(Company.pipeline_stage == pipeline_stage)

    total = db.execute(count_stmt).scalar_one()
    stmt = stmt.order_by(Company.name).offset((page - 1) * page_size).limit(page_size)
    companies = db.execute(stmt).scalars().all()

    items = []
    for c in companies:
        drives_count = db.execute(select(func.count()).where(Drive.company_id == c.id)).scalar_one()
        hired = db.execute(
            select(func.count()).select_from(Application).join(Drive, Drive.id == Application.drive_id).where(
                Drive.company_id == c.id, Application.stage == ApplicationStage.SELECTED
            )
        ).scalar_one()
        items.append({
            "id": c.id, "name": c.name, "industry": c.industry, "city": c.city,
            "pipeline_stage": c.pipeline_stage, "drives_count": drives_count, "students_hired": hired,
        })

    return CompanyListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=max(1, math.ceil(total / page_size)))


@router.post("", response_model=CompanyDetail, status_code=201)
def create_company(payload: CompanyCreate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> CompanyDetail:
    existing = db.execute(select(Company).where(Company.institution_id == tenant_id, Company.name == payload.name)).scalar_one_or_none()
    if existing:
        raise ConflictError(f"A company named '{payload.name}' already exists.")

    company = Company(institution_id=tenant_id, **payload.model_dump())
    db.add(company)
    db.flush()
    activity_service.emit(db, institution_id=tenant_id, entity_type="company", entity_id=company.id, event_type="company.created", actor_user_id=current_user.id)
    audit_service.record(db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="company", entity_id=company.id, action="CREATE")
    db.commit()
    db.refresh(company)
    return CompanyDetail.model_validate(company)


@router.get("/{company_id}", response_model=CompanyDetail)
def get_company(company_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> CompanyDetail:
    company = db.get(Company, company_id)
    if not company or company.institution_id != tenant_id:
        raise NotFoundError("Company not found.")
    return CompanyDetail.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyDetail)
def update_company(company_id: uuid.UUID, payload: CompanyUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> CompanyDetail:
    company = db.get(Company, company_id)
    if not company or company.institution_id != tenant_id:
        raise NotFoundError("Company not found.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(company, field, value)
    db.flush()
    activity_service.emit(db, institution_id=tenant_id, entity_type="company", entity_id=company.id, event_type="company.updated", actor_user_id=current_user.id, metadata={"fields": list(changes.keys())})
    db.commit()
    db.refresh(company)
    return CompanyDetail.model_validate(company)


@router.post("/{company_id}/contacts", response_model=CompanyContactOut, status_code=201)
def add_contact(company_id: uuid.UUID, payload: CompanyContactIn, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> CompanyContactOut:
    company = db.get(Company, company_id)
    if not company or company.institution_id != tenant_id:
        raise NotFoundError("Company not found.")
    contact = CompanyContact(institution_id=tenant_id, company_id=company_id, **payload.model_dump())
    db.add(contact)
    db.flush()
    audit_service.record(db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="company_contact", entity_id=contact.id, action="CREATE")
    db.commit()
    db.refresh(contact)
    return CompanyContactOut.model_validate(contact)
