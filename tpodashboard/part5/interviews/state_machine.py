"""
Part 5 — State machine guards.

Nothing else in this codebase is allowed to write interview_status,
attendance_status, or publication_state directly. Every write goes
through transition() below, which raises InvalidTransitionError on
anything not explicitly whitelisted. This is what section 11 of the
spec means by "never allow arbitrary frontend strings to become
authoritative state."
"""

from .enums import InterviewStatus as S, PublicationState as P


class InvalidTransitionError(Exception):
    pass


# Interview lifecycle status transitions.
# Key = current status, Value = set of statuses it may move to.
_INTERVIEW_TRANSITIONS = {
    S.SCHEDULED: {S.CONFIRMED, S.CANCELLED, S.RESCHEDULED, S.ATTENDED, S.NO_SHOW},
    S.CONFIRMED: {S.ATTENDED, S.NO_SHOW, S.CANCELLED, S.RESCHEDULED},
    S.ATTENDED: {S.COMPLETED, S.RESULT_PENDING},
    S.COMPLETED: {S.RESULT_PENDING, S.RESULT_PUBLISHED},
    S.NO_SHOW: {S.RESCHEDULED, S.RESULT_PENDING, S.RESULT_PUBLISHED},
    S.RESCHEDULED: {S.SCHEDULED, S.CONFIRMED, S.CANCELLED},
    S.RESULT_PENDING: {S.RESULT_PUBLISHED},
    S.RESULT_PUBLISHED: set(),   # terminal for this record; corrections use versioning, not a status walk-back
    S.CANCELLED: set(),          # terminal
}

# Result publication staging (section 34). One-directional forward walk;
# a correction after publication does NOT move this backward — it creates
# a new result version and re-emits INTERVIEW_RESULT_PUBLISHED (section 40).
_PUBLICATION_TRANSITIONS = {
    P.INTERNAL_RESULT: {P.TPO_REVIEWED},
    P.TPO_REVIEWED: {P.PUBLISHED_TO_STUDENT, P.INTERNAL_RESULT},  # allow un-reviewing before publish
    P.PUBLISHED_TO_STUDENT: set(),  # published stays published; corrections version forward, see results.py
}


def transition_interview_status(current: S, target: S) -> S:
    if target == current:
        return current
    allowed = _INTERVIEW_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(
            f"Interview status cannot move from {current.value} to {target.value}. "
            f"Allowed: {sorted(a.value for a in allowed) or 'none (terminal state)'}"
        )
    return target


def transition_publication_state(current: P, target: P) -> P:
    if target == current:
        return current
    allowed = _PUBLICATION_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(
            f"Publication state cannot move from {current.value} to {target.value}. "
            f"Allowed: {sorted(a.value for a in allowed) or 'none (terminal state)'}"
        )
    return target
