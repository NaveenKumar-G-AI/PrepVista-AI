"""
Profile completion is a simple, transparent weighted checklist —
deliberately not a black box, so a TPO can understand why a student
shows 60% instead of 90%.
"""
from app.models.student import Student

_FIELD_WEIGHTS: list[tuple[str, int]] = [
    ("roll_number", 10),
    ("institutional_email", 15),
    ("personal_email", 5),
    ("phone", 15),
    ("gender", 5),
    ("date_of_birth", 10),
]
_HAS_ACADEMIC_WEIGHT = 25
_HAS_PROFILE_WEIGHT = 15


def compute_profile_completion(student: Student) -> int:
    score = 0
    for field, weight in _FIELD_WEIGHTS:
        if getattr(student, field, None):
            score += weight
    if student.academic_records:
        score += _HAS_ACADEMIC_WEIGHT
    if student.professional_profile and (
        student.professional_profile.headline or student.professional_profile.preferred_roles
    ):
        score += _HAS_PROFILE_WEIGHT
    return min(100, score)
