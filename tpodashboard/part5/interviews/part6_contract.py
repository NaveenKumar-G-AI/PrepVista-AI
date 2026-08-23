"""
Part 5 — Read-only hooks for Part 6 (Offers & Joining). Section 56.

Part 6 is only ever a READER of Part 5 data through these three
functions. It must never reach into interview_results directly, and
nothing here accepts writes from Part 6.
"""

from .db import get_conn
from .enums import ResultValue, PublicationState


def get_final_selected_candidates(drive_id: str):
    """Students with a PUBLISHED PASS on the last (highest-sequence)
    round of the drive — i.e., who cleared the whole process."""
    with get_conn() as conn:
        last_round = conn.execute(
            "SELECT id FROM round_executions WHERE drive_id = ? ORDER BY sequence DESC LIMIT 1", (drive_id,)
        ).fetchone()
        if not last_round:
            return []
        rows = conn.execute(
            """SELECT s.id student_id, s.name, s.register_no FROM interviews i
               JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               JOIN students s ON s.id = i.student_id
               WHERE i.drive_id = ? AND i.round_execution_id = ?
                 AND ir.result = ? AND ir.publication_state = ?""",
            (drive_id, last_round["id"], ResultValue.PASS_.value, PublicationState.PUBLISHED_TO_STUDENT.value),
        ).fetchall()
    return [dict(r) for r in rows]


def get_approved_final_results(drive_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT i.id interview_id, i.student_id, i.round_execution_id, ir.result, ir.published_at
               FROM interviews i JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               WHERE i.drive_id = ? AND ir.publication_state = ?""",
            (drive_id, PublicationState.PUBLISHED_TO_STUDENT.value),
        ).fetchall()
    return [dict(r) for r in rows]


def get_student_final_interview_outcome(application_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT i.round_execution_id, ir.result, ir.published_at FROM interviews i
               JOIN interview_results ir ON ir.interview_id = i.id AND ir.is_current = 1
               WHERE i.application_id = ? AND ir.publication_state = ?
               ORDER BY ir.published_at DESC""",
            (application_id, PublicationState.PUBLISHED_TO_STUDENT.value),
        ).fetchall()
    return [dict(r) for r in rows]
