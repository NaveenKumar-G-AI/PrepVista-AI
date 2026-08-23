from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, TenantId
from app.models.application import Application
from app.models.company import Company
from app.models.drive import Drive, DriveStatus
from app.models.institution import Department
from app.models.offer import Offer
from app.models.student import PlacementStatus, Student, StudentStatus
from app.schemas.dashboard import ReadinessOverviewResponse, StudentOverviewResponse
from app.services import data_quality_service, readiness_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/student-overview", response_model=StudentOverviewResponse)
def student_overview(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> StudentOverviewResponse:
    total = db.execute(select(func.count()).where(Student.institution_id == tenant_id)).scalar_one()
    if total == 0:
        return StudentOverviewResponse(
            total_students=0, active_students=0, seeking=0, placed=0, higher_studies=0,
            not_seeking=0, opted_out=0, withdrawn=0, avg_profile_completion_pct=0.0,
            data_health_score=100, students_with_readiness=0, students_without_readiness=0,
            active_drives=0, total_applications=0, total_offers=0, placement_percentage=None,
            companies_engaged=0,
        )

    def _count(where_clause) -> int:
        return db.execute(select(func.count()).where(Student.institution_id == tenant_id, where_clause)).scalar_one()

    active = _count(Student.status == StudentStatus.ACTIVE)
    seeking = _count(Student.placement_status == PlacementStatus.SEEKING)
    placed = _count(Student.placement_status == PlacementStatus.PLACED)
    higher_studies = _count(Student.placement_status == PlacementStatus.HIGHER_STUDIES)
    not_seeking = _count(Student.placement_status == PlacementStatus.NOT_SEEKING)
    opted_out = _count(Student.placement_status == PlacementStatus.OPTED_OUT)
    withdrawn = _count(Student.placement_status == PlacementStatus.WITHDRAWN)

    avg_completion = db.execute(
        select(func.avg(Student.profile_completion_pct)).where(Student.institution_id == tenant_id)
    ).scalar_one()

    dq = data_quality_service.compute_data_quality(db, institution_id=tenant_id)
    with_readiness = readiness_service.count_students_with_readiness(db, institution_id=tenant_id)

    active_drives = db.execute(
        select(func.count()).where(Drive.institution_id == tenant_id, Drive.status == DriveStatus.ACTIVE)
    ).scalar_one()
    total_applications = db.execute(select(func.count()).where(Application.institution_id == tenant_id)).scalar_one()
    total_offers = db.execute(select(func.count()).where(Offer.institution_id == tenant_id)).scalar_one()
    companies_engaged = db.execute(select(func.count()).where(Company.institution_id == tenant_id)).scalar_one()

    eligible_pool = seeking + placed  # actively-seeking students plus those already placed this season
    placement_pct = round(placed / eligible_pool * 100, 1) if eligible_pool > 0 else None

    return StudentOverviewResponse(
        total_students=total,
        active_students=active,
        seeking=seeking,
        placed=placed,
        higher_studies=higher_studies,
        not_seeking=not_seeking,
        opted_out=opted_out,
        withdrawn=withdrawn,
        avg_profile_completion_pct=round(float(avg_completion or 0), 1),
        data_health_score=dq["data_health_score"],
        students_with_readiness=with_readiness,
        students_without_readiness=total - with_readiness,
        active_drives=active_drives,
        total_applications=total_applications,
        total_offers=total_offers,
        placement_percentage=placement_pct,
        companies_engaged=companies_engaged,
    )


@router.get("/readiness-overview", response_model=ReadinessOverviewResponse)
def readiness_overview(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> ReadinessOverviewResponse:
    total = db.execute(select(func.count()).where(Student.institution_id == tenant_id)).scalar_one()
    all_ids = list(db.execute(select(Student.id).where(Student.institution_id == tenant_id)).scalars().all())
    cohort_avg = readiness_service.get_cohort_readiness(db, institution_id=tenant_id, student_ids=all_ids)
    assessed = readiness_service.count_students_with_readiness(db, institution_id=tenant_id)

    departments = db.execute(select(Department).where(Department.institution_id == tenant_id)).scalars().all()
    by_dept = {}
    for dept in departments:
        by_dept[dept.code] = readiness_service.get_department_readiness(db, institution_id=tenant_id, department_id=dept.id)

    return ReadinessOverviewResponse(
        cohort_average=cohort_avg, students_assessed=assessed, students_total=total, by_department=by_dept
    )
