import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.activity import ActivityEvent
from app.models.student import Student
from app.schemas.activity import ActivityEventOut

router = APIRouter(prefix="/students/{student_id}/activity", tags=["activity"])


@router.get("", response_model=list[ActivityEventOut])
def get_student_activity(student_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[ActivityEventOut]:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")

    rows = db.execute(
        select(ActivityEvent)
        .where(
            ActivityEvent.institution_id == tenant_id,
            ActivityEvent.entity_type == "student",
            ActivityEvent.entity_id == student_id,
        )
        .order_by(ActivityEvent.created_at.desc())
        .limit(200)
    ).scalars().all()
    return [ActivityEventOut.model_validate(r) for r in rows]
