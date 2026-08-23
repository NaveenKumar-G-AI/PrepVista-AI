"""
Part 5 — Enumerations.

These are the ONLY authoritative status vocabularies for the interview
domain. Nothing in this module accepts an arbitrary frontend string as
state (see state_machine.py) — every transition is validated against
these sets.

Three separate tracks are kept deliberately distinct (see PART5_REPORT.md,
section "Interview status intelligence"): interview lifecycle status,
attendance status, and result/publication status. They are NOT merged
into one overloaded enum.
"""

from enum import Enum


class InterviewStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    ATTENDED = "ATTENDED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"
    RESULT_PENDING = "RESULT_PENDING"
    RESULT_PUBLISHED = "RESULT_PUBLISHED"


class AttendanceStatus(str, Enum):
    NOT_RECORDED = "NOT_RECORDED"
    PRESENT = "PRESENT"
    LATE = "LATE"
    ABSENT = "ABSENT"
    EXCUSED = "EXCUSED"


class ResultValue(str, Enum):
    PASS_ = "PASS"
    FAIL = "FAIL"
    HOLD = "HOLD"
    NO_SHOW = "NO_SHOW"
    DISQUALIFIED = "DISQUALIFIED"
    PENDING = "PENDING"


class ResultSource(str, Enum):
    TPO_ENTERED = "TPO_ENTERED"
    IMPORTED = "IMPORTED"
    ADMIN_IMPORTED = "ADMIN_IMPORTED"
    SYSTEM_GENERATED = "SYSTEM_GENERATED"
    OTHER_APPROVED_SOURCE = "OTHER_APPROVED_SOURCE"


class PublicationState(str, Enum):
    """Result visibility staging — see section 34 of the spec.
    A result can be true internally without a student ever having seen it.
    """
    INTERNAL_RESULT = "INTERNAL_RESULT"
    TPO_REVIEWED = "TPO_REVIEWED"
    PUBLISHED_TO_STUDENT = "PUBLISHED_TO_STUDENT"


class RoundExecutionStatus(str, Enum):
    PLANNED = "PLANNED"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    IN_PROGRESS = "IN_PROGRESS"
    RESULT_PENDING = "RESULT_PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class IssueType(str, Enum):
    WRONG_SCHEDULE = "WRONG_SCHEDULE"
    CANNOT_ACCESS_LINK = "CANNOT_ACCESS_LINK"
    SCHEDULING_CONFLICT = "SCHEDULING_CONFLICT"
    TECHNICAL_ISSUE = "TECHNICAL_ISSUE"
    OTHER = "OTHER"


class IssueStatus(str, Enum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"


class Role(str, Enum):
    STUDENT = "STUDENT"
    TPO = "TPO"
    MANAGEMENT = "MANAGEMENT"
    ADMIN = "ADMIN"


class EventType(str, Enum):
    INTERVIEW_CREATED = "INTERVIEW_CREATED"
    INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED"
    INTERVIEW_UPDATED = "INTERVIEW_UPDATED"
    INTERVIEW_RESCHEDULED = "INTERVIEW_RESCHEDULED"
    INTERVIEW_CANCELLED = "INTERVIEW_CANCELLED"

    INTERVIEW_ATTENDANCE_RECORDED = "INTERVIEW_ATTENDANCE_RECORDED"
    INTERVIEW_NO_SHOW = "INTERVIEW_NO_SHOW"
    INTERVIEW_COMPLETED = "INTERVIEW_COMPLETED"

    INTERVIEW_RESULT_CREATED = "INTERVIEW_RESULT_CREATED"
    INTERVIEW_RESULT_UPDATED = "INTERVIEW_RESULT_UPDATED"
    INTERVIEW_RESULT_REVIEWED = "INTERVIEW_RESULT_REVIEWED"
    INTERVIEW_RESULT_PUBLISHED = "INTERVIEW_RESULT_PUBLISHED"
    INTERVIEW_RESULT_CORRECTED = "INTERVIEW_RESULT_CORRECTED"

    STUDENT_ADVANCED_TO_NEXT_ROUND = "STUDENT_ADVANCED_TO_NEXT_ROUND"
    STUDENT_REJECTED_FROM_ROUND = "STUDENT_REJECTED_FROM_ROUND"
    STUDENT_PLACEMENT_HOLD = "STUDENT_PLACEMENT_HOLD"

    INTERVIEW_ISSUE_REPORTED = "INTERVIEW_ISSUE_REPORTED"
    INTERVIEW_ISSUE_RESOLVED = "INTERVIEW_ISSUE_RESOLVED"
