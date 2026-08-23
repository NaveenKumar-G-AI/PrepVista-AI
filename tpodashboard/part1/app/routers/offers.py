import math
import uuid

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, TenantId
from app.models.company import Company
from app.models.offer import Offer, OfferStatus
from app.models.student import Student
from app.schemas.application import OfferListResponse, OfferOut, OfferUpdate
from app.services import funnel_service

router = APIRouter(prefix="/offers", tags=["offers"])


def _to_out(offer: Offer, student_name: str, company_name: str) -> OfferOut:
    return OfferOut(
        id=offer.id, application_id=offer.application_id, student_id=offer.student_id, student_name=student_name,
        company_id=offer.company_id, company_name=company_name, ctc_lpa=offer.ctc_lpa, status=offer.status,
        extended_at=offer.extended_at, expiry_date=offer.expiry_date, accepted_at=offer.accepted_at,
        joining_date=offer.joining_date, joining_confirmed=offer.joining_confirmed,
    )


@router.get("", response_model=OfferListResponse)
def list_offers(
    db: DbSession, tenant_id: TenantId, _: CurrentUser,
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200), status_: OfferStatus | None = Query(None, alias="status"),
) -> OfferListResponse:
    stmt = (
        select(Offer, Student.full_name, Company.name)
        .join(Student, Student.id == Offer.student_id)
        .join(Company, Company.id == Offer.company_id)
        .where(Offer.institution_id == tenant_id)
    )
    count_stmt = select(func.count()).select_from(Offer).where(Offer.institution_id == tenant_id)
    if status_:
        stmt = stmt.where(Offer.status == status_)
        count_stmt = count_stmt.where(Offer.status == status_)

    total = db.execute(count_stmt).scalar_one()
    stmt = stmt.order_by(Offer.extended_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).all()
    items = [_to_out(o, sname, cname) for o, sname, cname in rows]
    return OfferListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=max(1, math.ceil(total / page_size)))


@router.patch("/{offer_id}", response_model=OfferOut)
def update_offer(offer_id: uuid.UUID, payload: OfferUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> OfferOut:
    offer = funnel_service.update_offer_status(
        db, institution_id=tenant_id, actor_user_id=current_user.id, offer_id=offer_id,
        new_status=payload.status, joining_confirmed=payload.joining_confirmed, joining_date=payload.joining_date,
    )
    db.commit()
    db.refresh(offer)
    student = db.get(Student, offer.student_id)
    company = db.get(Company, offer.company_id)
    return _to_out(offer, student.full_name, company.name)


@router.get("/expiring", response_model=list[OfferOut])
def expiring_offers(db: DbSession, tenant_id: TenantId, _: CurrentUser, within_hours: int = Query(48, ge=1)) -> list[OfferOut]:
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) + timedelta(hours=within_hours)).date()
    rows = db.execute(
        select(Offer, Student.full_name, Company.name)
        .join(Student, Student.id == Offer.student_id)
        .join(Company, Company.id == Offer.company_id)
        .where(Offer.institution_id == tenant_id, Offer.status == OfferStatus.EXTENDED, Offer.expiry_date.isnot(None), Offer.expiry_date <= cutoff)
    ).all()
    return [_to_out(o, sname, cname) for o, sname, cname in rows]
