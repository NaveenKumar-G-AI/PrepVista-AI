import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import NotFoundError
from app.models.student import Skill, Student, StudentSkill
from app.schemas.skill import StudentSkillOut

router = APIRouter(prefix="/students/{student_id}/skills", tags=["skills"])


@router.get("", response_model=list[StudentSkillOut])
def get_student_skills(student_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[StudentSkillOut]:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")

    rows = db.execute(
        select(StudentSkill, Skill.name, Skill.category)
        .join(Skill, Skill.id == StudentSkill.skill_id)
        .where(StudentSkill.student_id == student_id)
    ).all()

    return [
        StudentSkillOut(
            id=ss.id, skill_id=ss.skill_id, skill_name=name, category=category,
            proficiency=ss.proficiency, source=ss.source, verified=ss.verified,
        )
        for ss, name, category in rows
    ]
