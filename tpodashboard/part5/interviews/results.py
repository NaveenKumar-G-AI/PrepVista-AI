"""
Part 5 — Result entry, versioning, review, publication, round progression.
Sections 13-17, 30, 33-40 of the spec.

The one rule everything else here serves: a result is never silently
overwritten (section 15), and a student never sees a result the TPO
hasn't reviewed (section 34). Every "UPDATE" you might expect on
interview_results is actually an INSERT of a new version with the old
row marked is_current = 0 — the full history stays queryable.

Same single-connection-per-operation discipline as scheduling.py.
"""

import uuid
from datetime import datetime, timezone

from .db import get_conn
from .enums import InterviewStatus, ResultValue, ResultSource, PublicationState, EventType
from .state_machine import transition_interview_status, InvalidTransitionError
from . import audit, events


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class ResultError(Exception):
    pass


def get_current_result(interview_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (interview_id,)
        ).fetchone()
        return dict(row) if row else None


def result_history(interview_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM interview_results WHERE interview_id = ? ORDER BY version ASC", (interview_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def _advance_interview_status(conn, interview_row, new_status: InterviewStatus, actor, action):
    current = InterviewStatus(interview_row["interview_status"])
    transition_interview_status(current, new_status)
    cur = conn.execute(
        "UPDATE interviews SET interview_status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
        (new_status.value, _now(), interview_row["id"], interview_row["version"]),
    )
    if cur.rowcount == 0:
        raise ResultError("Concurrent update detected on interview status — reload and retry.")
    audit.record(conn, actor, action, "interview", interview_row["id"],
                 old_value={"interview_status": current.value}, new_value={"interview_status": new_status.value})


def enter_result(interview_id: str, result: ResultValue, remarks: str, actor: str,
                  source: ResultSource = ResultSource.TPO_ENTERED):
    """Section 30 (single/bulk entry) — first entry or a fresh internal
    value. Always lands as INTERNAL_RESULT; never visible to the student
    until reviewed + published.
    """
    with get_conn() as conn:
        interview = conn.execute("SELECT * FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if not interview:
            raise ResultError("Interview not found.")
        prev = conn.execute(
            "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (interview_id,)
        ).fetchone()
        if prev and prev["publication_state"] == PublicationState.PUBLISHED_TO_STUDENT.value:
            raise ResultError(
                "This interview already has a published result. Use correct_result() — "
                "entering a fresh result would silently overwrite a published outcome."
            )

        next_version = (prev["version"] + 1) if prev else 1
        if prev:
            conn.execute("UPDATE interview_results SET is_current = 0 WHERE id = ?", (prev["id"],))

        rid = _new_id("res")
        now = _now()
        conn.execute(
            """INSERT INTO interview_results (id, interview_id, result, remarks, result_source,
               publication_state, entered_by, entered_at, version, supersedes_version, is_current)
               VALUES (?,?,?,?,?,?,?,?,?,?,1)""",
            (rid, interview_id, result.value, remarks, source.value,
             PublicationState.INTERNAL_RESULT.value, actor, now, next_version,
             prev["version"] if prev else None),
        )
        audit.record(conn, actor, "RESULT_ENTERED", "interview_result", rid,
                     new_value={"result": result.value}, metadata={"interview_id": interview_id})
        events.emit(conn, EventType.INTERVIEW_RESULT_CREATED, {"interview_id": interview_id, "result": result.value})

        try:
            _advance_interview_status(conn, interview, InterviewStatus.RESULT_PENDING, actor, "RESULT_ENTERED")
        except InvalidTransitionError:
            pass
    return rid


def correct_result(interview_id: str, new_result: ResultValue, reason: str, actor: str, remarks: str = None):
    """Section 15/40. Never mutates the existing row — always a new
    version. If the prior version had already reached a student's
    screen, the correction is published immediately (there's no "un-ring
    the bell" option, so the right move is to get the corrected answer
    in front of the student as fast as possible, not to sit on it).
    """
    if not reason or not reason.strip():
        raise ResultError("A correction requires a reason.")

    with get_conn() as conn:
        prev = conn.execute(
            "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (interview_id,)
        ).fetchone()
        if not prev:
            raise ResultError("No existing result to correct — use enter_result() for a first entry.")

        was_published = prev["publication_state"] == PublicationState.PUBLISHED_TO_STUDENT.value
        conn.execute("UPDATE interview_results SET is_current = 0 WHERE id = ?", (prev["id"],))

        rid = _new_id("res")
        now = _now()
        new_pub_state = PublicationState.PUBLISHED_TO_STUDENT.value if was_published else PublicationState.INTERNAL_RESULT.value
        conn.execute(
            """INSERT INTO interview_results (id, interview_id, result, remarks, result_source,
               publication_state, entered_by, entered_at, reviewed_by, reviewed_at, published_at,
               version, supersedes_version, correction_reason, is_current)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
            (rid, interview_id, new_result.value, remarks, prev["result_source"],
             new_pub_state, actor, now,
             actor if was_published else None, now if was_published else None,
             now if was_published else None,
             prev["version"] + 1, prev["version"], reason),
        )
        audit.record(conn, actor, "RESULT_CORRECTED", "interview_result", rid,
                     old_value={"result": prev["result"]}, new_value={"result": new_result.value},
                     reason=reason, metadata={"interview_id": interview_id, "was_published": was_published})
        events.emit(conn, EventType.INTERVIEW_RESULT_CORRECTED,
                    {"interview_id": interview_id, "old_result": prev["result"], "new_result": new_result.value})
        if was_published:
            events.emit(conn, EventType.INTERVIEW_RESULT_PUBLISHED,
                        {"interview_id": interview_id, "result": new_result.value, "is_correction": True})
    return rid


def review_batch(drive_id: str, round_execution_id: str, actor: str):
    """Section 33 — 'results ready' counts before publication, and marks
    every currently-internal result in scope as TPO_REVIEWED.
    """
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT ir.* FROM interview_results ir
               JOIN interviews i ON i.id = ir.interview_id
               WHERE i.drive_id = ? AND i.round_execution_id = ?
                 AND ir.is_current = 1 AND ir.publication_state = ?""",
            (drive_id, round_execution_id, PublicationState.INTERNAL_RESULT.value),
        ).fetchall()

        for r in rows:
            conn.execute(
                "UPDATE interview_results SET publication_state = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
                (PublicationState.TPO_REVIEWED.value, actor, _now(), r["id"]),
            )
            audit.record(conn, actor, "RESULT_REVIEWED", "interview_result", r["id"])
            events.emit(conn, EventType.INTERVIEW_RESULT_REVIEWED, {"interview_id": r["interview_id"]})

        completed_without_result = conn.execute(
            """SELECT COUNT(*) c FROM interviews i
               WHERE i.drive_id = ? AND i.round_execution_id = ?
                 AND i.interview_status IN ('COMPLETED', 'RESULT_PENDING', 'NO_SHOW')
                 AND NOT EXISTS (SELECT 1 FROM interview_results ir WHERE ir.interview_id = i.id AND ir.is_current = 1)""",
            (drive_id, round_execution_id),
        ).fetchone()["c"]

    counts = {}
    for r in rows:
        counts[r["result"]] = counts.get(r["result"], 0) + 1
    return {"reviewed_counts": counts, "missing": completed_without_result, "total_reviewed": len(rows)}


def publish_preview(interview_ids: list[str]):
    """Section 69 — what will happen if you hit Publish, before you hit
    it. No writes.
    """
    ready, missing, not_reviewed = [], [], []
    with get_conn() as conn:
        for iid in interview_ids:
            r = conn.execute(
                "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (iid,)
            ).fetchone()
            if not r:
                missing.append(iid)
            elif r["publication_state"] == PublicationState.TPO_REVIEWED.value:
                ready.append(iid)
            elif r["publication_state"] == PublicationState.PUBLISHED_TO_STUDENT.value:
                pass  # already published, publish() will just no-op these
            else:
                not_reviewed.append(iid)
    return {"will_publish": len(ready), "missing_results": len(missing), "not_yet_reviewed": len(not_reviewed),
            "ready_ids": ready, "missing_ids": missing, "not_reviewed_ids": not_reviewed}


def publish(interview_ids: list[str], actor: str, require_no_gaps: bool = False):
    """Sections 34-38. Moves reviewed results to PUBLISHED_TO_STUDENT,
    flips the interview lifecycle status, and fires the round-progression
    events. Deliberately idempotent on already-published interviews so a
    retried bulk-publish click can't double-fire events.
    """
    preview = publish_preview(interview_ids)
    if require_no_gaps and (preview["missing_results"] or preview["not_yet_reviewed"]):
        raise ResultError(
            f"Publish blocked by policy: {preview['missing_results']} missing, "
            f"{preview['not_yet_reviewed']} not yet reviewed."
        )

    published, skipped = [], []
    with get_conn() as conn:
        for iid in interview_ids:
            r = conn.execute(
                "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (iid,)
            ).fetchone()
            if not r or r["publication_state"] != PublicationState.TPO_REVIEWED.value:
                skipped.append(iid)
                continue

            conn.execute(
                "UPDATE interview_results SET publication_state = ?, published_at = ? WHERE id = ?",
                (PublicationState.PUBLISHED_TO_STUDENT.value, _now(), r["id"]),
            )
            interview = conn.execute("SELECT * FROM interviews WHERE id = ?", (iid,)).fetchone()
            try:
                _advance_interview_status(conn, interview, InterviewStatus.RESULT_PUBLISHED, actor, "RESULT_PUBLISHED")
            except InvalidTransitionError:
                pass

            published.append(iid)
            audit.record(conn, actor, "RESULT_PUBLISHED", "interview_result", r["id"], new_value={"result": r["result"]})
            events.emit(conn, EventType.INTERVIEW_RESULT_PUBLISHED, {"interview_id": iid, "result": r["result"]})

            if r["result"] == ResultValue.PASS_.value:
                events.emit(conn, EventType.STUDENT_ADVANCED_TO_NEXT_ROUND, {"interview_id": iid, "student_id": interview["student_id"]})
            elif r["result"] == ResultValue.FAIL.value:
                events.emit(conn, EventType.STUDENT_REJECTED_FROM_ROUND, {"interview_id": iid, "student_id": interview["student_id"]})
            elif r["result"] == ResultValue.HOLD.value:
                events.emit(conn, EventType.STUDENT_PLACEMENT_HOLD, {"interview_id": iid, "student_id": interview["student_id"]})

    return {"published": published, "skipped_not_reviewed": skipped}


def round_progression(drive_id: str, round_execution_id: str):
    """Section 37 — how many PASS candidates from this round are now
    eligible for whatever the next configured round is. Part 5 does not
    create that next round's schedule itself (that's a fresh
    create_interview() call once TPO decides to schedule it) — this just
    answers "how many, who."
    """
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT i.student_id, s.name, s.register_no FROM interviews i
               JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               JOIN students s ON s.id = i.student_id
               WHERE i.drive_id = ? AND i.round_execution_id = ?
                 AND ir.result = ? AND ir.publication_state = ?""",
            (drive_id, round_execution_id, ResultValue.PASS_.value, PublicationState.PUBLISHED_TO_STUDENT.value),
        ).fetchall()
    return {"eligible_count": len(rows), "students": [dict(r) for r in rows]}
