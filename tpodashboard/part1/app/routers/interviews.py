import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.application import Application, InterviewSchedule
from app.models.drive import InterviewRound
from app.models.student import Student
from app.schemas.application import InterviewScheduleCreate, InterviewScheduleOut, InterviewScheduleUpdate
from app.services import activity_service, audit_service

router = APIRouter(prefix="/interview-schedules", tags=["interviews"])


def _to_out(schedule: InterviewSchedule, round_name: str, student_name: str) -> InterviewScheduleOut:
    return InterviewScheduleOut(
        id=schedule.id, application_id=schedule.application_id, round_id=schedule.round_id, round_name=round_name,
        student_name=student_name, scheduled_at=schedule.scheduled_at, status=schedule.status,
        result=schedule.result, interviewer_name=schedule.interviewer_name, feedback=schedule.feedback,
    )


@router.post("", response_model=InterviewScheduleOut, status_code=201)
def create_schedule(payload: InterviewScheduleCreate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> InterviewScheduleOut:
    application = db.get(Application, payload.application_id)
    if not application or application.institution_id != tenant_id:
        raise NotFoundError("Application not found.")
    round_ = db.get(InterviewRound, payload.round_id)
    if not round_ or round_.institution_id != tenant_id:
        raise NotFoundError("Interview round not found.")

    schedule = InterviewSchedule(institution_id=tenant_id, **payload.model_dump())
    db.add(schedule)
    db.flush()
    activity_service.emit(
        db, institution_id=tenant_id, entity_type="interview_schedule", entity_id=schedule.id,
        event_type="interview.scheduled", actor_user_id=current_user.id,
    )
    audit_service.record(db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="interview_schedule", entity_id=schedule.id, action="CREATE")
    db.commit()
    db.refresh(schedule)
    student = db.get(Student, application.student_id)
    return _to_out(schedule, round_.name, student.full_name)


@router.patch("/{schedule_id}", response_model=InterviewScheduleOut)
def update_schedule(schedule_id: uuid.UUID, payload: InterviewScheduleUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> InterviewScheduleOut:
    schedule = db.get(InterviewSchedule, schedule_id)
    if not schedule or schedule.institution_id != tenant_id:
        raise NotFoundError("Interview schedule not found.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(schedule, field, value)
    db.flush()
    activity_service.emit(
        db, institution_id=tenant_id, entity_type="interview_schedule", entity_id=schedule.id,
        event_type="interview.updated", actor_user_id=current_user.id, metadata={"fields": list(changes.keys())},
    )
    db.commit()
    db.refresh(schedule)
    application = db.get(Application, schedule.application_id)
    student = db.get(Student, application.student_id)
    return _to_out(schedule, schedule.round.name, student.full_name)


@router.get("/today", response_model=list[InterviewScheduleOut])
def today_schedule(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[InterviewScheduleOut]:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(hour=23, minute=59, second=59)
    rows = db.execute(
        select(InterviewSchedule, InterviewRound.name, Student.full_name)
        .join(InterviewRound, InterviewRound.id == InterviewSchedule.round_id)
        .join(Application, Application.id == InterviewSchedule.application_id)
        .join(Student, Student.id == Application.student_id)
        .where(
            InterviewSchedule.institution_id == tenant_id,
            InterviewSchedule.scheduled_at >= today_start,
            InterviewSchedule.scheduled_at <= today_end,
        )
        .order_by(InterviewSchedule.scheduled_at)
    ).all()
    return [_to_out(s, rname, sname) for s, rname, sname in rows]
