"""
Part 5 — Analytics. Sections 44-48.

Every number here is a real query against interviews/interview_results/
audit_log — nothing is a hardcoded placeholder or Math.random (section
75). Where the spec explicitly requires withholding a conclusion until
there's enough data (readiness-vs-outcome, section 45), that gate is
enforced here, not left to the UI to remember to apply.
"""

from .db import get_conn
from .enums import ResultValue, AttendanceStatus, PublicationState

MIN_SAMPLE_PER_BUCKET = 5   # section 45's "sufficient actual data" gate
MIN_INTERVIEWS_FOR_PATTERN = 3  # section 48


def attendance_summary(institution_id: str, drive_id: str = None):
    q = "SELECT attendance_status, COUNT(*) c FROM interviews WHERE institution_id = ?"
    params = [institution_id]
    if drive_id:
        q += " AND drive_id = ?"
        params.append(drive_id)
    q += " GROUP BY attendance_status"
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    counts = {r["attendance_status"]: r["c"] for r in rows}
    occurred = counts.get("PRESENT", 0) + counts.get("LATE", 0) + counts.get("ABSENT", 0) + counts.get("EXCUSED", 0)
    present_like = counts.get("PRESENT", 0) + counts.get("LATE", 0)
    return {
        "counts": counts,
        "attendance_rate": round(present_like / occurred, 4) if occurred else None,
        "absence_rate": round(counts.get("ABSENT", 0) / occurred, 4) if occurred else None,
        "late_rate": round(counts.get("LATE", 0) / occurred, 4) if occurred else None,
    }


def result_rates(drive_id: str, round_execution_id: str = None, published_only: bool = False):
    q = """SELECT ir.result, COUNT(*) c FROM interview_results ir
           JOIN interviews i ON i.id = ir.interview_id
           WHERE i.drive_id = ? AND ir.is_current = 1"""
    params = [drive_id]
    if round_execution_id:
        q += " AND i.round_execution_id = ?"
        params.append(round_execution_id)
    if published_only:
        q += " AND ir.publication_state = ?"
        params.append(PublicationState.PUBLISHED_TO_STUDENT.value)
    q += " GROUP BY ir.result"
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    counts = {r["result"]: r["c"] for r in rows}
    total = sum(counts.values())
    rates = {k: round(v / total, 4) for k, v in counts.items()} if total else {}
    return {"counts": counts, "rates": rates, "total": total}


def round_conversion(drive_id: str):
    """Section 44 — previous stage -> interview stage -> next-stage
    progression, per configured round, in sequence order."""
    with get_conn() as conn:
        rounds = conn.execute(
            "SELECT * FROM round_executions WHERE drive_id = ? ORDER BY sequence ASC", (drive_id,)
        ).fetchall()
        out = []
        for rnd in rounds:
            source_round = conn.execute("SELECT name FROM source_rounds WHERE id = ?", (rnd["source_round_id"],)).fetchone()
            round_name = source_round["name"] if source_round else None
            entered = conn.execute(
                "SELECT COUNT(*) c FROM interviews WHERE drive_id = ? AND round_execution_id = ?",
                (drive_id, rnd["id"]),
            ).fetchone()["c"]
            passed = conn.execute(
                """SELECT COUNT(*) c FROM interview_results ir JOIN interviews i ON i.id = ir.interview_id
                   WHERE i.drive_id = ? AND i.round_execution_id = ? AND ir.is_current = 1
                     AND ir.result = ? AND ir.publication_state = ?""",
                (drive_id, rnd["id"], ResultValue.PASS_.value, PublicationState.PUBLISHED_TO_STUDENT.value),
            ).fetchone()["c"]
            out.append({
                "round": round_name, "sequence": rnd["sequence"], "entered": entered,
                "passed": passed, "conversion_rate": round(passed / entered, 4) if entered else None,
            })
    return out


def result_turnaround(drive_id: str = None):
    """Section 44 — time from interview completion to result publication,
    using the audit trail's COMPLETED transition timestamp (not a
    re-derived guess) against interview_results.published_at.
    """
    with get_conn() as conn:
        q = """SELECT i.id, i.drive_id FROM interviews i WHERE i.interview_status = 'RESULT_PUBLISHED'"""
        params = []
        if drive_id:
            q += " AND i.drive_id = ?"
            params.append(drive_id)
        interviews = conn.execute(q, params).fetchall()

        deltas = []
        for iv in interviews:
            completed_audit = conn.execute(
                """SELECT at FROM audit_log WHERE entity_type = 'interview' AND entity_id = ?
                   AND new_value LIKE '%"COMPLETED"%' ORDER BY at ASC LIMIT 1""",
                (iv["id"],),
            ).fetchone()
            published = conn.execute(
                "SELECT published_at FROM interview_results WHERE interview_id = ? AND is_current = 1",
                (iv["id"],),
            ).fetchone()
            if completed_audit and published and published["published_at"]:
                from datetime import datetime
                t0 = datetime.fromisoformat(completed_audit["at"])
                t1 = datetime.fromisoformat(published["published_at"])
                deltas.append((t1 - t0).total_seconds() / 3600.0)

    if not deltas:
        return {"sample_size": 0, "avg_hours": None, "median_hours": None}
    deltas.sort()
    mid = len(deltas) // 2
    median = deltas[mid] if len(deltas) % 2 else (deltas[mid - 1] + deltas[mid]) / 2
    return {"sample_size": len(deltas), "avg_hours": round(sum(deltas) / len(deltas), 1), "median_hours": round(median, 1)}


def department_breakdown(drive_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT s.department, COUNT(DISTINCT i.id) participation,
                      SUM(CASE WHEN ir.result = 'PASS' AND ir.publication_state = 'PUBLISHED_TO_STUDENT' THEN 1 ELSE 0 END) passed,
                      COUNT(DISTINCT CASE WHEN ir.publication_state = 'PUBLISHED_TO_STUDENT' THEN i.id END) decided
               FROM interviews i JOIN students s ON s.id = i.student_id
               LEFT JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               WHERE i.drive_id = ? GROUP BY s.department""",
            (drive_id,),
        ).fetchall()
    return [
        {"department": r["department"], "participation": r["participation"], "passed": r["passed"],
         "pass_rate": round(r["passed"] / r["decided"], 4) if r["decided"] else None}
        for r in rows
    ]


def batch_breakdown(drive_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT s.batch, COUNT(DISTINCT i.id) participation,
                      SUM(CASE WHEN ir.result = 'PASS' AND ir.publication_state = 'PUBLISHED_TO_STUDENT' THEN 1 ELSE 0 END) passed,
                      COUNT(DISTINCT CASE WHEN ir.publication_state = 'PUBLISHED_TO_STUDENT' THEN i.id END) decided
               FROM interviews i JOIN students s ON s.id = i.student_id
               LEFT JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               WHERE i.drive_id = ? GROUP BY s.batch""",
            (drive_id,),
        ).fetchall()
    return [
        {"batch": r["batch"], "participation": r["participation"], "passed": r["passed"],
         "pass_rate": round(r["passed"] / r["decided"], 4) if r["decided"] else None}
        for r in rows
    ]


def readiness_vs_outcome(institution_id: str, min_sample: int = MIN_SAMPLE_PER_BUCKET):
    """Section 45-46. Buckets PUBLISHED outcomes by readiness score and
    reports pass rate per bucket — but ONLY for buckets that clear the
    minimum sample size. Below that, the bucket says so instead of
    guessing. This function will never invent a relationship from a
    handful of data points.
    """
    buckets = [("80+", 80, 1000), ("70-79", 70, 80), ("60-69", 60, 70), ("<60", -1000, 60)]
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT rs.readiness_score, ir.result FROM interview_results ir
               JOIN interviews i ON i.id = ir.interview_id
               JOIN readiness_scores_stub rs ON rs.student_id = i.student_id
               WHERE i.institution_id = ? AND ir.is_current = 1 AND ir.publication_state = ?""",
            (institution_id, PublicationState.PUBLISHED_TO_STUDENT.value),
        ).fetchall()

    out = []
    for label, lo, hi in buckets:
        in_bucket = [r for r in rows if lo <= r["readiness_score"] < hi]
        n = len(in_bucket)
        if n < min_sample:
            out.append({"bucket": label, "sample_size": n, "pass_rate": None,
                        "note": "Not enough verified outcomes yet."})
        else:
            passed = sum(1 for r in in_bucket if r["result"] == ResultValue.PASS_.value)
            out.append({"bucket": label, "sample_size": n, "pass_rate": round(passed / n, 4), "note": None})
    return out


def repeated_non_advancement(institution_id: str, min_interviews: int = MIN_INTERVIEWS_FOR_PATTERN):
    """Section 48 — surfaced as a pattern to look into, not a label on
    the student. Callers must not render this as 'flagged' or 'at risk'
    — see PART5_REPORT.md, AI insight contract notes.
    """
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT i.student_id, s.name, s.register_no, COUNT(*) total,
                      SUM(CASE WHEN ir.result = 'PASS' THEN 1 ELSE 0 END) passes
               FROM interviews i
               JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               JOIN students s ON s.id = i.student_id
               WHERE i.institution_id = ? AND ir.publication_state = 'PUBLISHED_TO_STUDENT'
               GROUP BY i.student_id HAVING total >= ? AND passes = 0""",
            (institution_id, min_interviews),
        ).fetchall()
    return [{"student_id": r["student_id"], "name": r["name"], "register_no": r["register_no"],
             "completed_interviews": r["total"]} for r in rows]
