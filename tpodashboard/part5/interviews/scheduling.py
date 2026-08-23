"""
Part 5 — Scheduling, attendance, issues, reschedule requests.
Sections 10-12, 18-22, 28-29, 43 of the spec.

Every mutating function here opens exactly ONE connection for its whole
operation (including its audit/event writes) and never opens a second
one while the first is open — see audit.py's docstring for why that
matters.
"""

import uuid
from datetime import datetime, timezone

from .db import get_conn
from .enums import InterviewStatus, AttendanceStatus, EventType, IssueStatus
from .state_machine import transition_interview_status, InvalidTransitionError
from . import audit, events


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class SchedulingError(Exception):
    pass


def create_interview(*, institution_id, season_id, drive_id, application_id, student_id,
                      round_execution_id, scheduled_at_iso, timezone_name, duration_minutes,
                      mode, location=None, meeting_reference=None, instructions=None, actor):
    """Section 10/18. Creates a SCHEDULED interview. This does not touch
    Application or Drive tables — those stay owned by Parts 3/4.
    """
    iid = _new_id("intv")
    now = _now()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO interviews (id, institution_id, season_id, drive_id, application_id,
                student_id, round_execution_id, scheduled_at, timezone, duration_minutes, mode,
                location, meeting_reference, instructions, interview_status, attendance_status,
                student_confirmed, version, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (iid, institution_id, season_id, drive_id, application_id, student_id,
             round_execution_id, scheduled_at_iso, timezone_name, duration_minutes, mode,
             location, meeting_reference, instructions, InterviewStatus.SCHEDULED.value,
             AttendanceStatus.NOT_RECORDED.value, 0, 1, now, now),
        )
        audit.record(conn, actor, "INTERVIEW_CREATED", "interview", iid, new_value={"scheduled_at": scheduled_at_iso})
        events.emit(conn, EventType.INTERVIEW_CREATED, {"interview_id": iid, "student_id": student_id})
        events.emit(conn, EventType.INTERVIEW_SCHEDULED, {"interview_id": iid, "student_id": student_id})
    return iid


def get_interview(interview_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        return dict(row) if row else None


def _write_interview_status(conn, interview_row, new_status: InterviewStatus, actor, action, reason=None):
    """Caller MUST already be inside an open `with get_conn() as conn:`
    block and pass that same conn — this never opens its own.
    """
    current = InterviewStatus(interview_row["interview_status"])
    transition_interview_status(current, new_status)  # raises InvalidTransitionError if illegal
    cur = conn.execute(
        "UPDATE interviews SET interview_status = ?, version = version + 1, updated_at = ? "
        "WHERE id = ? AND version = ?",
        (new_status.value, _now(), interview_row["id"], interview_row["version"]),
    )
    if cur.rowcount == 0:
        raise SchedulingError("Concurrent update detected — reload and retry (optimistic lock miss).")
    audit.record(conn, actor, action, "interview", interview_row["id"],
                 old_value={"interview_status": current.value},
                 new_value={"interview_status": new_status.value}, reason=reason)


def student_confirm(interview_id: str, student_id: str, actor: str):
    """Section 21. Student-initiated confirmation — allowed because it's
    additive and auditable, not a rewrite of the schedule itself.
    """
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if not row:
            raise SchedulingError("Interview not found.")
        if row["student_id"] != student_id:
            raise SchedulingError("Cannot confirm another student's interview.")
        conn.execute("UPDATE interviews SET student_confirmed = 1, updated_at = ? WHERE id = ?",
                     (_now(), interview_id))
        if InterviewStatus(row["interview_status"]) == InterviewStatus.SCHEDULED:
            _write_interview_status(conn, row, InterviewStatus.CONFIRMED, actor, "STUDENT_CONFIRMED")


def record_attendance(interview_id: str, status: AttendanceStatus, actor: str, reason: str = None):
    """Sections 12, 28-29. TPO-only in practice (enforced by role check
    at the API boundary) — students cannot self-mark attendance, per
    section 21's 'do not allow students to manipulate actual attendance
    records themselves.'

    PRESENT/LATE walks the lifecycle through ATTENDED -> COMPLETED
    (both are real, distinct states in section 11's status list, not a
    single skip-ahead jump) so the audit trail shows the real sequence.
    """
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if not row:
            raise SchedulingError("Interview not found.")
        old_attendance = row["attendance_status"]
        conn.execute(
            "UPDATE interviews SET attendance_status = ?, updated_at = ? WHERE id = ?",
            (status.value, _now(), interview_id),
        )
        audit.record(conn, actor, "ATTENDANCE_RECORDED", "interview", interview_id,
                     old_value={"attendance_status": old_attendance},
                     new_value={"attendance_status": status.value}, reason=reason)
        events.emit(conn, EventType.INTERVIEW_ATTENDANCE_RECORDED,
                    {"interview_id": interview_id, "status": status.value})

        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()  # fresh version

        if status == AttendanceStatus.ABSENT:
            try:
                _write_interview_status(conn, row, InterviewStatus.NO_SHOW, actor, "MARKED_NO_SHOW", reason)
                events.emit(conn, EventType.INTERVIEW_NO_SHOW, {"interview_id": interview_id})
            except InvalidTransitionError:
                pass  # already past that point in the lifecycle; attendance record still stands
        elif status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE):
            current = InterviewStatus(row["interview_status"])
            try:
                if current in (InterviewStatus.SCHEDULED, InterviewStatus.CONFIRMED):
                    _write_interview_status(conn, row, InterviewStatus.ATTENDED, actor, "MARKED_ATTENDED")
                    row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
                _write_interview_status(conn, row, InterviewStatus.COMPLETED, actor, "MARKED_COMPLETED")
                events.emit(conn, EventType.INTERVIEW_COMPLETED, {"interview_id": interview_id})
            except InvalidTransitionError:
                pass


def report_issue(interview_id: str, student_id: str, issue_type, details: str, actor: str):
    """Section 21/43."""
    iss_id = _new_id("issue")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO interview_issues (id, interview_id, student_id, issue_type, details,
               status, reported_at) VALUES (?,?,?,?,?,?,?)""",
            (iss_id, interview_id, student_id, issue_type.value, details, IssueStatus.OPEN.value, _now()),
        )
        audit.record(conn, actor, "ISSUE_REPORTED", "interview_issue", iss_id, new_value={"issue_type": issue_type.value})
        events.emit(conn, EventType.INTERVIEW_ISSUE_REPORTED, {"issue_id": iss_id, "interview_id": interview_id})
    return iss_id


def resolve_issue(issue_id: str, actor: str, resolution_notes: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE interview_issues SET status = ?, resolved_by = ?, resolved_at = ?, resolution_notes = ? "
            "WHERE id = ?",
            (IssueStatus.RESOLVED.value, actor, _now(), resolution_notes, issue_id),
        )
        audit.record(conn, actor, "ISSUE_RESOLVED", "interview_issue", issue_id, new_value={"resolution_notes": resolution_notes})
        events.emit(conn, EventType.INTERVIEW_ISSUE_RESOLVED, {"issue_id": issue_id})


def cancel_interview(interview_id: str, actor: str, reason: str = None):
    """Section 10 — cancellation goes through the state machine like
    everything else; there is no separate raw-UPDATE path for it."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if not row:
            raise SchedulingError("Interview not found.")
        _write_interview_status(conn, row, InterviewStatus.CANCELLED, actor, "INTERVIEW_CANCELLED", reason)
        events.emit(conn, EventType.INTERVIEW_CANCELLED, {"interview_id": interview_id})


def request_reschedule(interview_id: str, student_id: str, reason: str, actor: str):
    """Section 22 — this is explicitly NOT a direct schedule rewrite.
    It creates a request; TPO decides."""
    req_id = _new_id("resched")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO reschedule_requests (id, interview_id, student_id, reason, status, requested_at)
               VALUES (?,?,?,?,?,?)""",
            (req_id, interview_id, student_id, reason, "PENDING", _now()),
        )
        audit.record(conn, actor, "RESCHEDULE_REQUESTED", "interview", interview_id, reason=reason)
    return req_id
