"""
ReadinessService: the read-side contract for 'how ready is this
student / cohort / department'. Part 1 ships this interface and its
storage table, populated by nothing yet — there is no readiness
assessment engine in this part. Every method here returns None /
empty rather than a computed-looking placeholder when no
ReadinessSnapshot rows exist, so the UI can honestly show
"No assessment yet" instead of a fabricated number.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.readiness import ReadinessSnapshot
from app.models.student import Student


def get_student_readiness(db: Session, *, institution_id: uuid.UUID, student_id: uuid.UUID) -> int | None:
    stmt = (
        select(ReadinessSnapshot.overall_score)
        .where(
            ReadinessSnapshot.institution_id == institution_id,
            ReadinessSnapshot.student_id == student_id,
        )
        .order_by(ReadinessSnapshot.computed_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_cohort_readiness(db: Session, *, institution_id: uuid.UUID, student_ids: list[uuid.UUID]) -> float | None:
    if not student_ids:
        return None
    # latest snapshot per student, then average
    latest = (
        select(
            ReadinessSnapshot.student_id,
            func.max(ReadinessSnapshot.computed_at).label("latest_at"),
        )
        .where(ReadinessSnapshot.institution_id == institution_id, ReadinessSnapshot.student_id.in_(student_ids))
        .group_by(ReadinessSnapshot.student_id)
        .subquery()
    )
    stmt = select(func.avg(ReadinessSnapshot.overall_score)).join(
        latest,
        (ReadinessSnapshot.student_id == latest.c.student_id)
        & (ReadinessSnapshot.computed_at == latest.c.latest_at),
    )
    result = db.execute(stmt).scalar_one_or_none()
    return float(result) if result is not None else None


def get_department_readiness(db: Session, *, institution_id: uuid.UUID, department_id: uuid.UUID) -> float | None:
    student_ids = list(
        db.execute(
            select(Student.id).where(
                Student.institution_id == institution_id, Student.department_id == department_id
            )
        )
        .scalars()
        .all()
    )
    return get_cohort_readiness(db, institution_id=institution_id, student_ids=student_ids)


def count_students_with_readiness(db: Session, *, institution_id: uuid.UUID) -> int:
    stmt = select(func.count(func.distinct(ReadinessSnapshot.student_id))).where(
        ReadinessSnapshot.institution_id == institution_id
    )
    return db.execute(stmt).scalar_one()
