import uuid

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.application import Application, ApplicationStage
from app.models.drive import Drive
from app.models.student import Student
from app.schemas.application import ApplicationCreate, ApplicationOut, ApplicationStageUpdate, DriveFunnelResponse, FunnelStageCount
from app.services import funnel_service

router = APIRouter(tags=["applications"])


@router.post("/applications", response_model=ApplicationOut, status_code=201)
def create_application(payload: ApplicationCreate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> ApplicationOut:
    application = funnel_service.apply_to_drive(
        db, institution_id=tenant_id, actor_user_id=current_user.id,
        drive_id=payload.drive_id, student_id=payload.student_id,
    )
    db.commit()
    db.refresh(application)
    student = db.get(Student, application.student_id)
    return ApplicationOut(
        id=application.id, drive_id=application.drive_id, student_id=application.student_id,
        student_name=student.full_name, stage=application.stage, applied_at=application.applied_at,
    )


@router.patch("/applications/{application_id}/stage", response_model=ApplicationOut)
def update_stage(application_id: uuid.UUID, payload: ApplicationStageUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> ApplicationOut:
    application = funnel_service.transition_application_stage(
        db, institution_id=tenant_id, actor_user_id=current_user.id,
        application_id=application_id, new_stage=payload.stage,
    )
    db.commit()
    db.refresh(application)
    student = db.get(Student, application.student_id)
    return ApplicationOut(
        id=application.id, drive_id=application.drive_id, student_id=application.student_id,
        student_name=student.full_name, stage=application.stage, applied_at=application.applied_at,
    )


@router.get("/drives/{drive_id}/applications", response_model=list[ApplicationOut])
def list_drive_applications(drive_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[ApplicationOut]:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")
    rows = db.execute(
        select(Application, Student.full_name).join(Student, Student.id == Application.student_id).where(Application.drive_id == drive_id)
    ).all()
    return [
        ApplicationOut(id=a.id, drive_id=a.drive_id, student_id=a.student_id, student_name=name, stage=a.stage, applied_at=a.applied_at)
        for a, name in rows
    ]


@router.get("/drives/{drive_id}/funnel", response_model=DriveFunnelResponse)
def get_drive_funnel(drive_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> DriveFunnelResponse:
    drive = db.get(Drive, drive_id)
    if not drive or drive.institution_id != tenant_id:
        raise NotFoundError("Drive not found.")

    eligible_ids = funnel_service.get_eligible_student_ids(db, institution_id=tenant_id, drive=drive)

    counts = {}
    for stage in ApplicationStage:
        counts[stage.value] = db.execute(
            select(func.count()).where(Application.drive_id == drive_id, Application.stage == stage)
        ).scalar_one()

    total_applied = db.execute(select(func.count()).where(Application.drive_id == drive_id)).scalar_one()

    stages = [
        FunnelStageCount(stage="ELIGIBLE", count=len(eligible_ids)),
        FunnelStageCount(stage="APPLIED", count=total_applied),
        FunnelStageCount(stage="SHORTLISTED", count=counts[ApplicationStage.SHORTLISTED.value] + counts[ApplicationStage.INTERVIEWING.value] + counts[ApplicationStage.SELECTED.value]),
        FunnelStageCount(stage="INTERVIEWING", count=counts[ApplicationStage.INTERVIEWING.value] + counts[ApplicationStage.SELECTED.value]),
        FunnelStageCount(stage="SELECTED", count=counts[ApplicationStage.SELECTED.value]),
    ]
    return DriveFunnelResponse(drive_id=drive_id, eligible_count=len(eligible_ids), stages=stages)
