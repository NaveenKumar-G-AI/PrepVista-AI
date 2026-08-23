import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.student import AcademicRecord, Student
from app.schemas.academic import AcademicRecordIn, AcademicRecordOut
from app.services import activity_service, audit_service
from app.services.profile_completion import compute_profile_completion

router = APIRouter(prefix="/students/{student_id}/academic", tags=["academic"])


def _get_student_or_404(db: DbSession, tenant_id: uuid.UUID, student_id: uuid.UUID) -> Student:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")
    return student


@router.get("", response_model=list[AcademicRecordOut])
def get_academic_records(student_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[AcademicRecordOut]:
    _get_student_or_404(db, tenant_id, student_id)
    rows = db.execute(
        select(AcademicRecord).where(AcademicRecord.student_id == student_id).order_by(AcademicRecord.semester)
    ).scalars().all()
    return [AcademicRecordOut.model_validate(r) for r in rows]


@router.put("", response_model=AcademicRecordOut)
def upsert_academic_record(
    student_id: uuid.UUID, payload: AcademicRecordIn, db: DbSession, tenant_id: TenantId, current_user: CurrentUser
) -> AcademicRecordOut:
    student = _get_student_or_404(db, tenant_id, student_id)
    record = db.execute(
        select(AcademicRecord).where(AcademicRecord.student_id == student_id, AcademicRecord.semester == payload.semester)
    ).scalar_one_or_none()

    if record:
        for field, value in payload.model_dump().items():
            setattr(record, field, value)
        record.source = "manual"
        record.verified = False
    else:
        record = AcademicRecord(institution_id=tenant_id, student_id=student_id, source="manual", **payload.model_dump())
        db.add(record)
    db.flush()

    student.profile_completion_pct = compute_profile_completion(student)
    activity_service.emit(
        db, institution_id=tenant_id, entity_type="student", entity_id=student_id,
        event_type="academic_record.updated", actor_user_id=current_user.id,
    )
    audit_service.record(
        db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="academic_record",
        entity_id=record.id, action="UPSERT",
    )
    db.commit()
    db.refresh(record)
    return AcademicRecordOut.model_validate(record)
