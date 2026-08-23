import uuid

from fastapi import APIRouter

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.student import ProfessionalProfile, Student
from app.schemas.profile import ProfessionalProfileIn, ProfessionalProfileOut
from app.services import activity_service
from app.services.profile_completion import compute_profile_completion

router = APIRouter(prefix="/students/{student_id}/profile", tags=["profile"])


@router.get("", response_model=ProfessionalProfileOut | None)
def get_profile(student_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> ProfessionalProfileOut | None:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")
    if not student.professional_profile:
        return None
    return ProfessionalProfileOut.model_validate(student.professional_profile)


@router.patch("", response_model=ProfessionalProfileOut)
def update_profile(
    student_id: uuid.UUID, payload: ProfessionalProfileIn, db: DbSession, tenant_id: TenantId, current_user: CurrentUser
) -> ProfessionalProfileOut:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")

    profile = student.professional_profile
    changes = payload.model_dump(exclude_unset=True)
    if profile:
        for field, value in changes.items():
            setattr(profile, field, value)
    else:
        profile = ProfessionalProfile(institution_id=tenant_id, student_id=student_id, **changes)
        db.add(profile)
    db.flush()

    student.profile_completion_pct = compute_profile_completion(student)
    activity_service.emit(
        db, institution_id=tenant_id, entity_type="student", entity_id=student_id,
        event_type="profile.updated", actor_user_id=current_user.id, metadata={"fields": list(changes.keys())},
    )
    db.commit()
    db.refresh(profile)
    return ProfessionalProfileOut.model_validate(profile)
