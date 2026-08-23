"""
Part 5 — Service façade. Section 51 (the exact function list a future
AI layer is allowed to call) plus the TPO/student screen-level queries
that sections 18-27 and 41-42 describe. Every function here is a pure
read except where explicitly noted (student_confirm etc. live in
scheduling.py, not here — this file is deliberately read-oriented so it
is safe to hand to an AI tool layer per section 51/52).
"""

from datetime import datetime, timezone, timedelta

from .db import get_conn
from .enums import InterviewStatus, PublicationState, Role
from . import results as results_module
from . import analytics as analytics_module
from . import ai_contract
from .security import assert_can_view_interview, scrub_interview_for_student, AccessDeniedError


def _now():
    return datetime.now(timezone.utc)


def _row_with_context(conn, interview_row):
    d = dict(interview_row)
    student = conn.execute("SELECT * FROM students WHERE id = ?", (d["student_id"],)).fetchone()
    drive = conn.execute("SELECT * FROM drives WHERE id = ?", (d["drive_id"],)).fetchone()
    rnd = conn.execute("SELECT * FROM round_executions WHERE id = ?", (d["round_execution_id"],)).fetchone()
    round_name = None
    if rnd:
        source_round = conn.execute("SELECT name FROM source_rounds WHERE id = ?", (rnd["source_round_id"],)).fetchone()
        round_name = source_round["name"] if source_round else None
    d["student_name"] = student["name"] if student else None
    d["register_no"] = student["register_no"] if student else None
    d["department"] = student["department"] if student else None
    d["company_name"] = drive["company_name"] if drive else None
    d["role_title"] = drive["role_title"] if drive else None
    d["round_name"] = round_name
    return d


# ---- section 51 read services -------------------------------------------------

def get_today_interviews(institution_id: str):
    today = _now().date().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM interviews WHERE institution_id = ? AND date(scheduled_at) = date(?)
               ORDER BY scheduled_at ASC""",
            (institution_id, today),
        ).fetchall()
        return [_row_with_context(conn, r) for r in rows]


def get_upcoming_interviews(*, institution_id: str = None, student_id: str = None):
    now_iso = _now().isoformat()
    with get_conn() as conn:
        if student_id:
            rows = conn.execute(
                """SELECT * FROM interviews WHERE student_id = ? AND scheduled_at >= ?
                   AND interview_status NOT IN ('CANCELLED') ORDER BY scheduled_at ASC""",
                (student_id, now_iso),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM interviews WHERE institution_id = ? AND scheduled_at >= ?
                   AND interview_status NOT IN ('CANCELLED') ORDER BY scheduled_at ASC""",
                (institution_id, now_iso),
            ).fetchall()
        return [_row_with_context(conn, r) for r in rows]


def get_interview_status(interview_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT interview_status FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        return row["interview_status"] if row else None


def get_attendance(interview_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT attendance_status FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        return row["attendance_status"] if row else None


def get_pending_results(institution_id: str):
    """Section 42 — the Missing Results Workbench."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT i.* FROM interviews i WHERE i.institution_id = ?
               AND i.interview_status IN ('RESULT_PENDING', 'COMPLETED', 'NO_SHOW')
               AND NOT EXISTS (
                   SELECT 1 FROM interview_results ir WHERE ir.interview_id = i.id AND ir.is_current = 1
                   AND ir.publication_state = 'PUBLISHED_TO_STUDENT'
               ) ORDER BY i.scheduled_at ASC""",
            (institution_id,),
        ).fetchall()
        out = []
        for r in rows:
            ctx = _row_with_context(conn, r)
            days_waiting = (_now() - datetime.fromisoformat(r["updated_at"])).days
            ctx["days_waiting"] = max(days_waiting, 0)
            out.append(ctx)
        return out


def get_result(interview_id: str, requester_role: Role, requester_id: str, requester_institution_id: str):
    with get_conn() as conn:
        interview = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if not interview:
            return None
        assert_can_view_interview(requester_role, requester_id, requester_institution_id, dict(interview))
        current = results_module.get_current_result(interview_id)

        if requester_role == Role.STUDENT:
            ctx = _row_with_context(conn, interview)
            return scrub_interview_for_student(ctx, current)
        return current  # TPO/management see the full internal record


def get_round_results(drive_id: str, round_execution_id: str):
    return analytics_module.result_rates(drive_id, round_execution_id)


def get_round_progression(drive_id: str, round_execution_id: str):
    return results_module.round_progression(drive_id, round_execution_id)


def get_interview_issues(institution_id: str, open_only: bool = True):
    with get_conn() as conn:
        q = """SELECT ii.*, s.name student_name, s.register_no FROM interview_issues ii
               JOIN interviews i ON i.id = ii.interview_id JOIN students s ON s.id = ii.student_id
               WHERE i.institution_id = ?"""
        params = [institution_id]
        if open_only:
            q += " AND ii.status = 'OPEN'"
        rows = conn.execute(q, params).fetchall()
        return [dict(r) for r in rows]


def get_interview_analytics(institution_id: str, drive_id: str = None):
    return {
        "attendance": analytics_module.attendance_summary(institution_id, drive_id),
        "results": analytics_module.result_rates(drive_id, published_only=True) if drive_id else None,
        "round_conversion": analytics_module.round_conversion(drive_id) if drive_id else None,
        "turnaround": analytics_module.result_turnaround(drive_id),
        "by_department": analytics_module.department_breakdown(drive_id) if drive_id else None,
        "by_batch": analytics_module.batch_breakdown(drive_id) if drive_id else None,
    }


def get_student_interview_history(student_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM interviews WHERE student_id = ? ORDER BY scheduled_at ASC", (student_id,)
        ).fetchall()
        out = []
        for r in rows:
            ctx = _row_with_context(conn, r)
            current = results_module.get_current_result(r["id"])
            out.append(scrub_interview_for_student(ctx, current))
        return out


def get_readiness_vs_interview_outcome(institution_id: str):
    return analytics_module.readiness_vs_outcome(institution_id)


# ---- screen-level composites ---------------------------------------------

def get_student_dashboard(student_id: str):
    """Section 19 — My Interviews: Upcoming / Completed / Pending Result."""
    history = get_student_interview_history(student_id)
    now_iso = _now().isoformat()
    upcoming, completed, pending_result = [], [], []
    for iv in history:
        if iv["interview_status"] in ("SCHEDULED", "CONFIRMED") and iv["scheduled_at"] >= now_iso:
            upcoming.append(iv)
        elif iv["result"] is not None:
            completed.append(iv)
        else:
            pending_result.append(iv)
    return {"upcoming": upcoming, "completed": completed, "pending_result": pending_result}


def get_tpo_overview(institution_id: str):
    """Section 23 — top metrics for Interviews & Results."""
    with get_conn() as conn:
        def count(where, params=()):
            return conn.execute(f"SELECT COUNT(*) c FROM interviews WHERE institution_id = ? AND {where}",
                                 (institution_id, *params)).fetchone()["c"]
        today = _now().date().isoformat()
        return {
            "todays_interviews": conn.execute(
                "SELECT COUNT(*) c FROM interviews WHERE institution_id = ? AND date(scheduled_at) = date(?)",
                (institution_id, today)).fetchone()["c"],
            "upcoming": count("scheduled_at >= ? AND interview_status NOT IN ('CANCELLED')", (_now().isoformat(),)),
            "completed": count("interview_status IN ('COMPLETED','RESULT_PENDING','RESULT_PUBLISHED')"),
            "attendance_pending": count("attendance_status = 'NOT_RECORDED' AND interview_status != 'CANCELLED' AND scheduled_at < ?", (_now().isoformat(),)),
            "results_pending": len(get_pending_results(institution_id)),
            "published": count("interview_status = 'RESULT_PUBLISHED'"),
            "no_shows": count("attendance_status = 'ABSENT'"),
        }


def get_tpo_interview_list(institution_id: str, *, drive_id=None, round_execution_id=None, department=None,
                            status=None, attendance=None, search=None, limit=200, offset=0):
    """Sections 25-26 — server-side filtered list."""
    q = """SELECT i.* FROM interviews i JOIN students s ON s.id = i.student_id WHERE i.institution_id = ?"""
    params = [institution_id]
    if drive_id:
        q += " AND i.drive_id = ?"; params.append(drive_id)
    if round_execution_id:
        q += " AND i.round_execution_id = ?"; params.append(round_execution_id)
    if department:
        q += " AND s.department = ?"; params.append(department)
    if status:
        q += " AND i.interview_status = ?"; params.append(status)
    if attendance:
        q += " AND i.attendance_status = ?"; params.append(attendance)
    if search:
        q += " AND (s.name LIKE ? OR s.register_no LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    q += " ORDER BY i.scheduled_at ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
        return [_row_with_context(conn, r) for r in rows]


def get_command_centre_cards(institution_id: str):
    """Section 59 — real numbers only, no placeholders."""
    overview = get_tpo_overview(institution_id)
    issues = get_interview_issues(institution_id, open_only=True)
    pending = get_pending_results(institution_id)
    return {
        "todays_interviews": overview["todays_interviews"],
        "results_pending": overview["results_pending"],
        "attendance_pending": overview["attendance_pending"],
        "issues_requiring_attention": len(issues),
        "recent_results_published": overview["published"],
        "insights": {
            "result_pending": [ai_contract.build_result_pending_insight(p, p["days_waiting"]) for p in pending[:10]],
            "issues": [ai_contract.build_issue_insight(i) for i in issues[:10]],
        },
    }


# ---- literal section-51 name aliases (fidelity to the spec's own signatures) --
getTodayInterviews = get_today_interviews
getUpcomingInterviews = get_upcoming_interviews
getInterviewStatus = get_interview_status
getAttendance = get_attendance
getPendingResults = get_pending_results
getResult = get_result
getRoundResults = get_round_results
getRoundProgression = get_round_progression
getInterviewIssues = get_interview_issues
getInterviewAnalytics = get_interview_analytics
getStudentInterviewHistory = get_student_interview_history
getReadinessVsInterviewOutcome = get_readiness_vs_interview_outcome
