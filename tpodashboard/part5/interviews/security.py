"""
Part 5 — Security & scrubbing (section 60).

Two separate jobs live here, and mixing them up is exactly how a
student ends up seeing another student's interview, or seeing an
un-published result:

  1. SCOPE checks — may this actor even look at this row at all?
  2. SCRUB — given a row this actor is allowed to see, strip anything
     they're not allowed to see *inside* it (internal notes, an
     unpublished result, another institution's data).

Every read that could end up on a student or TPO screen goes through
both, in that order. Neither is optional and neither can be bypassed
by passing a different ID from the frontend — scope is re-checked
server-side against the authenticated actor, never trusted from a
request parameter.
"""

from .enums import Role, PublicationState


class AccessDeniedError(Exception):
    pass


def assert_can_view_interview(actor_role: Role, actor_id: str, actor_institution_id: str, interview: dict):
    """Row-level scope check. Raises AccessDeniedError rather than
    silently returning nothing, so a caller can never mistake
    'not authorized' for 'no such interview'.
    """
    if interview["institution_id"] != actor_institution_id:
        raise AccessDeniedError("Cross-institution access is never permitted.")

    if actor_role == Role.STUDENT:
        if interview["student_id"] != actor_id:
            # This is the exact "change the ID in the URL" attack from section 60.
            raise AccessDeniedError("Students may only view their own interview records.")
    elif actor_role in (Role.TPO, Role.ADMIN):
        return  # institution-scoped TPOs see all interviews in their institution
    elif actor_role == Role.MANAGEMENT:
        return  # management gets aggregate access; row-level access is intentionally still allowed here,
                # but callers serving Management UI should route through analytics.py, not raw rows,
                # per section 60 "management aggregate access" — enforced at the call-site, not here.
    else:
        raise AccessDeniedError(f"Unknown role: {actor_role}")


def scrub_interview_for_student(interview: dict, current_result: dict | None) -> dict:
    """Section 20 / 36: a student's view must never contain internal TPO
    notes, an unpublished result, or confidential flags — even if the
    caller accidentally fetched the full internal row.
    """
    safe = {
        "id": interview["id"],
        "company_name": interview.get("company_name"),
        "role_title": interview.get("role_title"),
        "round_name": interview.get("round_name"),
        "scheduled_at": interview["scheduled_at"],
        "timezone": interview["timezone"],
        "duration_minutes": interview["duration_minutes"],
        "mode": interview["mode"],
        "location": interview.get("location"),
        # Meeting reference (a private link/dial-in) only goes to the owning,
        # authorized student — never echoed for TPO-list views of other students.
        "meeting_reference": interview.get("meeting_reference"),
        "instructions": interview.get("instructions"),
        "interview_status": interview["interview_status"],
        "attendance_status": interview["attendance_status"],
        "student_confirmed": bool(interview["student_confirmed"]),
    }

    if current_result and current_result["publication_state"] == PublicationState.PUBLISHED_TO_STUDENT.value:
        safe["result"] = current_result["result"]
        safe["result_published_at"] = current_result["published_at"]
    else:
        # Section 39: HOLD and "not yet published" read identically to the
        # student — internal reasoning is never exposed either way.
        safe["result"] = None
        safe["result_published_at"] = None

    # Explicitly NOT included, even if present on the source row:
    # internal TPO remarks, entered_by, result_source, reviewed_by,
    # correction history, other students' data.
    return safe
