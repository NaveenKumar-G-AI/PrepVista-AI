"""
Part 5 — Result import pipeline. Sections 31-33, 63.

Nothing here trusts the uploaded file. Every row is checked against
real students/applications/interviews already in the system before it
touches interview_results, duplicates within the file are caught,
conflicts against already-published results are caught, and the
commit step only ever writes the rows that passed validation — the
rest come back in an explicit report (never a silent partial import).
"""

import csv
import io
from datetime import datetime, timezone

from .db import get_conn
from .enums import ResultValue, ResultSource
from . import results as results_module
from . import audit


REQUIRED_COLUMNS = {"Register Number", "Result"}


class ImportError_(Exception):
    pass


def parse_csv(file_text: str):
    reader = csv.DictReader(io.StringIO(file_text))
    if reader.fieldnames is None:
        raise ImportError_("File has no header row.")
    missing = REQUIRED_COLUMNS - set(c.strip() for c in reader.fieldnames)
    if missing:
        raise ImportError_(f"Missing required column(s): {', '.join(sorted(missing))}")
    return [dict(row) for row in reader]


def validate_import(rows: list[dict], institution_id: str, drive_id: str, round_execution_id: str):
    """Returns a preview — no writes. Section 32/33."""
    valid, unknown_student, no_interview, invalid_result, duplicate_in_file, conflict = [], [], [], [], [], []
    seen_register_nos = set()

    with get_conn() as conn:
        for i, row in enumerate(rows):
            reg_no = (row.get("Register Number") or "").strip()
            result_raw = (row.get("Result") or "").strip().upper()
            remarks = (row.get("Remarks") or "").strip() or None
            line = {"row": i + 2, "register_no": reg_no, "result_raw": result_raw}  # +2: header + 1-index

            if not reg_no:
                invalid_result.append({**line, "reason": "Register number is blank."})
                continue

            if reg_no in seen_register_nos:
                duplicate_in_file.append({**line, "reason": "Register number appears more than once in this file."})
                continue
            seen_register_nos.add(reg_no)

            try:
                result_value = ResultValue(result_raw)
            except ValueError:
                invalid_result.append({**line, "reason": f"'{result_raw}' is not a recognized result value."})
                continue

            student = conn.execute(
                "SELECT * FROM students WHERE institution_id = ? AND register_no = ?",
                (institution_id, reg_no),
            ).fetchone()
            if not student:
                unknown_student.append({**line, "reason": "No student with this register number at this institution."})
                continue

            interview = conn.execute(
                """SELECT i.* FROM interviews i
                   WHERE i.student_id = ? AND i.drive_id = ? AND i.round_execution_id = ?""",
                (student["id"], drive_id, round_execution_id),
            ).fetchone()
            if not interview:
                no_interview.append({**line, "student_name": student["name"],
                                      "reason": "No interview record for this student/drive/round."})
                continue

            current = conn.execute(
                "SELECT * FROM interview_results WHERE interview_id = ? AND is_current = 1", (interview["id"],)
            ).fetchone()
            if current and current["publication_state"] == "PUBLISHED_TO_STUDENT" and current["result"] != result_value.value:
                conflict.append({**line, "student_name": student["name"], "interview_id": interview["id"],
                                  "existing_result": current["result"], "incoming_result": result_value.value,
                                  "reason": "A different result is already published for this interview."})
                continue

            valid.append({**line, "student_id": student["id"], "student_name": student["name"],
                          "interview_id": interview["id"], "result": result_value.value, "remarks": remarks})

    return {
        "valid": valid, "unknown_student": unknown_student, "no_interview": no_interview,
        "invalid_result": invalid_result, "duplicate_in_file": duplicate_in_file, "conflict": conflict,
        "summary": {
            "total_rows": len(rows), "valid": len(valid), "unknown_student": len(unknown_student),
            "no_interview": len(no_interview), "invalid_result": len(invalid_result),
            "duplicate_in_file": len(duplicate_in_file), "conflict": len(conflict),
        },
    }


def commit_import(preview: dict, actor: str, source: ResultSource = ResultSource.IMPORTED):
    """Section 63 — transactional, and always returns a full report.
    Only 'valid' rows from validate_import() are ever written; everything
    else in the preview is surfaced back, never dropped silently.
    """
    committed, failed = [], []
    for row in preview["valid"]:
        try:
            results_module.enter_result(
                interview_id=row["interview_id"],
                result=ResultValue(row["result"]),
                remarks=row["remarks"],
                actor=actor,
                source=source,
            )
            committed.append(row["register_no"])
        except Exception as e:
            failed.append({"register_no": row["register_no"], "error": str(e)})

    with get_conn() as conn:
        audit.record(conn, actor, "RESULT_IMPORT_COMMITTED", "import_batch",
                     f"batch_{datetime.now(timezone.utc).isoformat()}",
                     new_value={"committed": len(committed), "failed": len(failed)})

    return {
        "committed_count": len(committed), "committed_register_nos": committed,
        "failed": failed,
        "skipped_report": {
            "unknown_student": preview["unknown_student"],
            "no_interview": preview["no_interview"],
            "invalid_result": preview["invalid_result"],
            "duplicate_in_file": preview["duplicate_in_file"],
            "conflict": preview["conflict"],
        },
    }
