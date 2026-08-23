"""
Student Data Health: a transparent, queryable breakdown of exactly
which records are missing what — not just a single opaque score.
Every issue_type here maps to a filter the frontend can apply to the
student list ("Fix 18 records" -> students list pre-filtered).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.student import AcademicRecord, Student

ISSUE_LABELS = {
    "missing_email": "Missing institutional email",
    "missing_phone": "Missing phone number",
    "missing_cgpa": "Missing CGPA",
    "incomplete_profile": "Profile completion below 50%",
}


def compute_data_quality(db: Session, *, institution_id: uuid.UUID) -> dict:
    base = select(Student).where(Student.institution_id == institution_id)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()

    if total == 0:
        return {"total_students": 0, "data_health_score": 100, "issues": []}

    missing_email = db.execute(
        select(func.count()).select_from(
            select(Student.id)
            .where(Student.institution_id == institution_id, Student.institutional_email.is_(None))
            .subquery()
        )
    ).scalar_one()

    missing_phone = db.execute(
        select(func.count()).select_from(
            select(Student.id)
            .where(Student.institution_id == institution_id, Student.phone.is_(None))
            .subquery()
        )
    ).scalar_one()

    students_with_cgpa = (
        select(AcademicRecord.student_id)
        .where(AcademicRecord.institution_id == institution_id, AcademicRecord.cumulative_cgpa.isnot(None))
        .distinct()
    )
    missing_cgpa = db.execute(
        select(func.count()).select_from(
            select(Student.id)
            .where(Student.institution_id == institution_id, Student.id.not_in(students_with_cgpa))
            .subquery()
        )
    ).scalar_one()

    incomplete_profile = db.execute(
        select(func.count()).select_from(
            select(Student.id)
            .where(Student.institution_id == institution_id, Student.profile_completion_pct < 50)
            .subquery()
        )
    ).scalar_one()

    issues = [
        {"issue_type": "missing_email", "label": ISSUE_LABELS["missing_email"], "count": missing_email},
        {"issue_type": "missing_phone", "label": ISSUE_LABELS["missing_phone"], "count": missing_phone},
        {"issue_type": "missing_cgpa", "label": ISSUE_LABELS["missing_cgpa"], "count": missing_cgpa},
        {
            "issue_type": "incomplete_profile",
            "label": ISSUE_LABELS["incomplete_profile"],
            "count": incomplete_profile,
        },
    ]
    issues = [i for i in issues if i["count"] > 0]

    # Score: 100 minus a weighted penalty per affected fraction, floored at 0.
    penalty = (
        (missing_email / total) * 25
        + (missing_phone / total) * 20
        + (missing_cgpa / total) * 30
        + (incomplete_profile / total) * 25
    )
    score = max(0, round(100 - penalty))

    return {"total_students": total, "data_health_score": score, "issues": issues}
