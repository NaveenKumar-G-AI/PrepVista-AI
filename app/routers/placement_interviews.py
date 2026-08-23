"""
PrepVista — Placement Interviews Router (Part 5 Integration)
=============================================================
Implements the full TPO Interview & Results domain for company placement drives.
Distinct from interview_sessions (PrepVista's AI mock-interview system).

State machine, attendance, versioned results, publication staging, and
analytics endpoints — all mirrored from Part 5's architecture.

API surface (all under /org/my/placement-interviews):

  Rounds:
    GET  /rounds/{drive_id}              list rounds for a drive
    POST /rounds/{drive_id}              create a round

  Interviews:
    GET  /                               list (filter: drive, round, status)
    POST /                               schedule an interview
    GET  /{id}                           full detail + current result + history
    POST /{id}/attendance                record attendance (TPO only)
    POST /{id}/status                    transition status (state machine)

  Results:
    POST /{id}/results                   enter/update result (INTERNAL_RESULT)
    POST /{id}/results/review            advance to TPO_REVIEWED
    POST /{id}/results/publish           publish to student
    GET  /results/pending                missing results workbench
    GET  /results/pending-review         results awaiting TPO review

  Analytics:
    GET  /analytics/summary              drive-level attendance + pass rates + turnaround
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter(prefix="/placement-interviews", tags=["placement-interviews"])


# ── State machine (mirrored from Part 5 state_machine.py) ─────────────────────

_INTERVIEW_TRANSITIONS: dict[str, list[str]] = {
    "SCHEDULED":        ["CONFIRMED", "CANCELLED", "RESCHEDULED", "ATTENDED", "NO_SHOW"],
    "CONFIRMED":        ["ATTENDED", "NO_SHOW", "CANCELLED", "RESCHEDULED"],
    "ATTENDED":         ["COMPLETED", "RESULT_PENDING"],
    "COMPLETED":        ["RESULT_PENDING", "RESULT_PUBLISHED"],
    "NO_SHOW":          ["RESCHEDULED", "RESULT_PENDING", "RESULT_PUBLISHED"],
    "RESCHEDULED":      ["SCHEDULED", "CONFIRMED", "CANCELLED"],
    "RESULT_PENDING":   ["RESULT_PUBLISHED"],
    "RESULT_PUBLISHED": [],
    "CANCELLED":        [],
}

_ATTENDANCE_FROM_STATUS: dict[str, list[str]] = {
    "PRESENT": ["ATTENDED"],
    "LATE":    ["ATTENDED"],
    "ABSENT":  ["NO_SHOW"],
    "EXCUSED": [],          # no automatic interview status change
}

_PUBLICATION_TRANSITIONS: dict[str, list[str]] = {
    "INTERNAL_RESULT":      ["TPO_REVIEWED"],
    "TPO_REVIEWED":         ["PUBLISHED_TO_STUDENT", "INTERNAL_RESULT"],
    "PUBLISHED_TO_STUDENT": [],
}

def _can_transition(from_s: str, to_s: str, table: dict[str, list[str]]) -> bool:
    return to_s in table.get(from_s, [])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _emit_event(conn, event_type: str, interview_id=None, drive_id=None,
                      student_id=None, actor_id=None, payload: dict | None = None):
    """Append to placement_interview_events — never raises."""
    try:
        await conn.execute(
            """INSERT INTO placement_interview_events
               (event_type, interview_id, drive_id, student_id, actor_id, payload)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            event_type,
            UUID(interview_id) if interview_id else None,
            UUID(drive_id)     if drive_id     else None,
            UUID(student_id)   if student_id   else None,
            UUID(actor_id)     if actor_id     else None,
            json.dumps(payload or {}),
        )
    except Exception:
        pass


async def _audit(conn, actor_id, actor_label: str, action: str,
                 entity_type: str, entity_id: str,
                 old_value: dict | None = None, new_value: dict | None = None):
    await conn.execute(
        """INSERT INTO placement_interview_audit
           (actor_id, actor_label, action, entity_type, entity_id, old_value, new_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        UUID(actor_id) if actor_id else None, actor_label, action, entity_type, str(entity_id),
        json.dumps(old_value) if old_value else None,
        json.dumps(new_value) if new_value else None,
    )


# ── Pydantic models ────────────────────────────────────────────────────────────

class CreateRoundRequest(BaseModel):
    name: str
    sequence: int

class ScheduleInterviewRequest(BaseModel):
    drive_id:          str
    round_execution_id: Optional[str] = None
    student_id:        str
    scheduled_at:      Optional[str] = None
    location_or_link:  Optional[str] = None

class AttendanceRequest(BaseModel):
    attendance_status: str   # PRESENT | LATE | ABSENT | EXCUSED

class TransitionStatusRequest(BaseModel):
    to_status: str
    reason: Optional[str] = None

class EnterResultRequest(BaseModel):
    result:       str           # PASS | FAIL | HOLD | NO_SHOW | DISQUALIFIED | PENDING
    remarks:      Optional[str] = None
    result_source: str = "TPO_ENTERED"

class ReviewResultRequest(BaseModel):
    notes: Optional[str] = None


# ── Valid value sets ───────────────────────────────────────────────────────────

VALID_INTERVIEW_STATUSES = set(_INTERVIEW_TRANSITIONS.keys())
VALID_ATTENDANCE          = {"PRESENT", "LATE", "ABSENT", "EXCUSED"}
VALID_RESULTS             = {"PASS", "FAIL", "HOLD", "NO_SHOW", "DISQUALIFIED", "PENDING"}
VALID_SOURCES             = {"TPO_ENTERED", "IMPORTED", "ADMIN_IMPORTED", "SYSTEM_GENERATED", "OTHER_APPROVED_SOURCE"}


# ── Routes: Rounds ─────────────────────────────────────────────────────────────

@router.get("/rounds/{drive_id}")
async def list_rounds(
    drive_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        drive = await conn.fetchval(
            "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")
        rows = await conn.fetch(
            "SELECT * FROM drive_round_executions WHERE drive_id = $1 ORDER BY sequence ASC",
            drive_id,
        )
    return {"rounds": [dict(r) for r in rows]}


@router.post("/rounds/{drive_id}")
async def create_round(
    drive_id: UUID,
    body: CreateRoundRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        drive = await conn.fetchval(
            "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")
        row = await conn.fetchrow(
            """INSERT INTO drive_round_executions (drive_id, organization_id, name, sequence)
               VALUES ($1,$2,$3,$4) RETURNING *""",
            drive_id, org_id, body.name, body.sequence,
        )
    return dict(row)


# ── Routes: Interviews ─────────────────────────────────────────────────────────

@router.get("")
async def list_interviews(
    drive_id:          Optional[str] = Query(None),
    round_execution_id: Optional[str] = Query(None),
    status:            Optional[str] = Query(None),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    if status and status not in VALID_INTERVIEW_STATUSES:
        raise HTTPException(422, "Invalid interview_status")

    clauses = ["pi.organization_id = $1"]
    params: list = [org_id]

    if drive_id:
        params.append(UUID(drive_id))
        clauses.append(f"pi.drive_id = ${len(params)}")
    if round_execution_id:
        params.append(UUID(round_execution_id))
        clauses.append(f"pi.round_execution_id = ${len(params)}")
    if status:
        params.append(status)
        clauses.append(f"pi.interview_status = ${len(params)}")

    where = " AND ".join(clauses)
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            f"""SELECT pi.id, pi.drive_id, pi.round_execution_id, pi.student_id,
                       pi.scheduled_at, pi.interview_status, pi.attendance_status,
                       pi.location_or_link, pi.created_at, pi.updated_at,
                       p.full_name AS student_name, p.email AS student_email,
                       pd.title AS drive_title, pd.company_name
                FROM placement_interviews pi
                JOIN profiles p ON p.id = pi.student_id
                JOIN placement_drives pd ON pd.id = pi.drive_id
                WHERE {where}
                ORDER BY pi.scheduled_at ASC NULLS LAST, pi.created_at DESC""",
            *params,
        )
    return {"items": [dict(r) for r in rows]}


@router.post("")
async def schedule_interview(
    body: ScheduleInterviewRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    drive_id = UUID(body.drive_id)

    async with DatabaseConnection() as conn:
        drive = await conn.fetchval(
            "SELECT 1 FROM placement_drives WHERE id = $1 AND organization_id = $2",
            drive_id, org_id,
        )
        if not drive:
            raise HTTPException(404, "Drive not found")

        student = await conn.fetchval(
            "SELECT 1 FROM organization_students WHERE user_id = $1 AND organization_id = $2 AND status = 'active'",
            UUID(body.student_id), org_id,
        )
        if not student:
            raise HTTPException(422, "Student is not an active member of this organization")

        scheduled_dt = datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else None

        row = await conn.fetchrow(
            """INSERT INTO placement_interviews
               (organization_id, drive_id, round_execution_id, student_id,
                scheduled_at, location_or_link, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
            org_id,
            drive_id,
            UUID(body.round_execution_id) if body.round_execution_id else None,
            UUID(body.student_id),
            scheduled_dt,
            body.location_or_link,
            admin.user_id,
        )
        await _audit(conn, admin.user_id, admin.email, "INTERVIEW_SCHEDULED",
                     "placement_interview", str(row["id"]),
                     new_value={"drive_id": str(drive_id), "student_id": body.student_id})
        await _emit_event(conn, "INTERVIEW_SCHEDULED",
                          interview_id=str(row["id"]), drive_id=str(drive_id),
                          student_id=body.student_id, actor_id=admin.user_id)
    return dict(row)


@router.get("/results/pending")
async def pending_results_workbench(
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Missing Results Workbench — interviews with no published result yet."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT pi.id, pi.drive_id, pi.student_id, pi.scheduled_at,
                      pi.interview_status, pi.attendance_status,
                      p.full_name AS student_name, p.email AS student_email,
                      pd.title AS drive_title, pd.company_name
               FROM placement_interviews pi
               JOIN profiles p  ON p.id  = pi.student_id
               JOIN placement_drives pd ON pd.id = pi.drive_id
               WHERE pi.organization_id = $1
                 AND pi.interview_status IN ('RESULT_PENDING','COMPLETED','NO_SHOW')
                 AND NOT EXISTS (
                     SELECT 1 FROM placement_interview_results pir
                     WHERE pir.interview_id = pi.id
                       AND pir.is_current = TRUE
                       AND pir.publication_state = 'PUBLISHED_TO_STUDENT'
                 )
               ORDER BY pi.scheduled_at ASC NULLS LAST""",
            org_id,
        )
    now = datetime.now(timezone.utc)
    items = []
    for r in rows:
        d = dict(r)
        if d.get("scheduled_at"):
            delta = now - d["scheduled_at"].replace(tzinfo=timezone.utc) if d["scheduled_at"].tzinfo is None else now - d["scheduled_at"]
            d["days_waiting"] = max(0, delta.days)
        items.append(d)
    return {"items": items, "count": len(items)}


@router.get("/results/pending-review")
async def pending_review(
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Results entered internally but not yet reviewed by TPO."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """SELECT pir.id AS result_id, pir.result, pir.remarks,
                      pi.id AS interview_id, pi.student_id, pi.drive_id, pi.scheduled_at,
                      p.full_name AS student_name, pd.title AS drive_title, pd.company_name
               FROM placement_interview_results pir
               JOIN placement_interviews pi ON pi.id = pir.interview_id
               JOIN profiles p  ON p.id  = pi.student_id
               JOIN placement_drives pd ON pd.id = pi.drive_id
               WHERE pi.organization_id = $1
                 AND pir.is_current = TRUE
                 AND pir.publication_state = 'INTERNAL_RESULT'
               ORDER BY pir.created_at ASC""",
            org_id,
        )
    return {"items": [dict(r) for r in rows], "count": len(rows)}


@router.get("/{interview_id}")
async def get_interview(
    interview_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT pi.*, p.full_name AS student_name, p.email AS student_email,
                      pd.title AS drive_title, pd.company_name, pd.role
               FROM placement_interviews pi
               JOIN profiles p ON p.id = pi.student_id
               JOIN placement_drives pd ON pd.id = pi.drive_id
               WHERE pi.id = $1 AND pi.organization_id = $2""",
            interview_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Interview not found")

        current_result = await conn.fetchrow(
            "SELECT * FROM placement_interview_results WHERE interview_id = $1 AND is_current = TRUE",
            interview_id,
        )
        result_history = await conn.fetch(
            "SELECT * FROM placement_interview_results WHERE interview_id = $1 ORDER BY version ASC",
            interview_id,
        )
        audit_rows = await conn.fetch(
            """SELECT actor_label, action, old_value, new_value, occurred_at
               FROM placement_interview_audit
               WHERE entity_type = 'placement_interview' AND entity_id = $1
               ORDER BY occurred_at DESC LIMIT 20""",
            str(interview_id),
        )
        issues = await conn.fetch(
            "SELECT * FROM placement_interview_issues WHERE interview_id = $1 ORDER BY created_at DESC",
            interview_id,
        )
    return {
        "interview":       dict(row),
        "current_result":  dict(current_result) if current_result else None,
        "result_history":  [dict(r) for r in result_history],
        "audit":           [dict(r) for r in audit_rows],
        "issues":          [dict(r) for r in issues],
        "legal_next_states": _INTERVIEW_TRANSITIONS.get(row["interview_status"], []),
    }


@router.post("/{interview_id}/attendance")
async def record_attendance(
    interview_id: UUID,
    body: AttendanceRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    att = body.attendance_status.upper()
    if att not in VALID_ATTENDANCE:
        raise HTTPException(422, f"Invalid attendance_status. Must be one of: {sorted(VALID_ATTENDANCE)}")

    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM placement_interviews WHERE id = $1 AND organization_id = $2",
            interview_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Interview not found")

        old_att = row["attendance_status"]
        old_status = row["interview_status"]

        # Determine new interview_status from attendance
        new_statuses = _ATTENDANCE_FROM_STATUS.get(att, [])
        new_status = new_statuses[0] if new_statuses else old_status

        # Validate interview status transition if changing
        if new_status != old_status and not _can_transition(old_status, new_status, _INTERVIEW_TRANSITIONS):
            raise HTTPException(422, f"Cannot transition from {old_status} to {new_status} via attendance {att}")

        await conn.execute(
            """UPDATE placement_interviews
               SET attendance_status = $1, interview_status = $2,
                   version = version + 1, updated_at = now()
               WHERE id = $3 AND version = $4""",
            att, new_status, interview_id, row["version"],
        )
        await _audit(conn, admin.user_id, admin.email, "ATTENDANCE_RECORDED",
                     "placement_interview", str(interview_id),
                     old_value={"attendance_status": old_att, "interview_status": old_status},
                     new_value={"attendance_status": att, "interview_status": new_status})
        await _emit_event(conn, "INTERVIEW_ATTENDANCE_RECORDED",
                          interview_id=str(interview_id), drive_id=str(row["drive_id"]),
                          student_id=str(row["student_id"]), actor_id=admin.user_id,
                          payload={"attendance": att, "new_status": new_status})

    return {"ok": True, "attendance_status": att, "interview_status": new_status}


@router.post("/{interview_id}/status")
async def transition_interview_status(
    interview_id: UUID,
    body: TransitionStatusRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    to_s = body.to_status.upper()
    if to_s not in VALID_INTERVIEW_STATUSES:
        raise HTTPException(422, f"Invalid status. Must be one of: {sorted(VALID_INTERVIEW_STATUSES)}")

    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM placement_interviews WHERE id = $1 AND organization_id = $2",
            interview_id, org_id,
        )
        if not row:
            raise HTTPException(404, "Interview not found")

        from_s = row["interview_status"]
        if not _can_transition(from_s, to_s, _INTERVIEW_TRANSITIONS):
            raise HTTPException(422, f"Cannot transition from {from_s} to {to_s}")

        await conn.execute(
            """UPDATE placement_interviews
               SET interview_status = $1, version = version + 1, updated_at = now()
               WHERE id = $2 AND version = $3""",
            to_s, interview_id, row["version"],
        )
        await _audit(conn, admin.user_id, admin.email, "STATUS_CHANGED",
                     "placement_interview", str(interview_id),
                     old_value={"interview_status": from_s},
                     new_value={"interview_status": to_s, "reason": body.reason})
        await _emit_event(conn, "INTERVIEW_UPDATED",
                          interview_id=str(interview_id), drive_id=str(row["drive_id"]),
                          student_id=str(row["student_id"]), actor_id=admin.user_id,
                          payload={"from": from_s, "to": to_s})

    return {"ok": True, "from_status": from_s, "to_status": to_s}


@router.post("/{interview_id}/results")
async def enter_result(
    interview_id: UUID,
    body: EnterResultRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Enter or update a result. Always INTERNAL_RESULT — never visible
    to student until reviewed + published (Part 5 sections 30/34)."""
    result_val = body.result.upper()
    if result_val not in VALID_RESULTS:
        raise HTTPException(422, f"Invalid result. Must be one of: {sorted(VALID_RESULTS)}")
    if body.result_source not in VALID_SOURCES:
        raise HTTPException(422, f"Invalid result_source")

    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        interview = await conn.fetchrow(
            "SELECT * FROM placement_interviews WHERE id = $1 AND organization_id = $2",
            interview_id, org_id,
        )
        if not interview:
            raise HTTPException(404, "Interview not found")

        # Check for already-published result (must use correction path instead)
        prev = await conn.fetchrow(
            "SELECT * FROM placement_interview_results WHERE interview_id = $1 AND is_current = TRUE",
            interview_id,
        )
        if prev and prev["publication_state"] == "PUBLISHED_TO_STUDENT":
            raise HTTPException(422,
                "This interview already has a published result. "
                "Use POST /{id}/results/correct to create a corrected version.")

        next_version = (int(prev["version"]) + 1) if prev else 1

        # Retire old current version
        if prev:
            await conn.execute(
                "UPDATE placement_interview_results SET is_current = FALSE WHERE id = $1",
                prev["id"],
            )

        row = await conn.fetchrow(
            """INSERT INTO placement_interview_results
               (interview_id, version, result, publication_state, result_source, remarks, entered_by)
               VALUES ($1,$2,$3,'INTERNAL_RESULT',$4,$5,$6) RETURNING *""",
            interview_id, next_version, result_val, body.result_source,
            body.remarks, admin.user_id,
        )
        # Advance interview status to RESULT_PENDING if possible
        current_s = interview["interview_status"]
        if _can_transition(current_s, "RESULT_PENDING", _INTERVIEW_TRANSITIONS):
            await conn.execute(
                "UPDATE placement_interviews SET interview_status = 'RESULT_PENDING', updated_at = now() WHERE id = $1",
                interview_id,
            )
        await _audit(conn, admin.user_id, admin.email,
                     "RESULT_CREATED" if next_version == 1 else "RESULT_UPDATED",
                     "placement_interview_result", str(interview_id),
                     new_value={"result": result_val, "version": next_version})
        await _emit_event(conn, "INTERVIEW_RESULT_CREATED" if next_version == 1 else "INTERVIEW_RESULT_UPDATED",
                          interview_id=str(interview_id), drive_id=str(interview["drive_id"]),
                          student_id=str(interview["student_id"]), actor_id=admin.user_id,
                          payload={"result": result_val, "version": next_version})
    return dict(row)


@router.post("/{interview_id}/results/review")
async def review_result(
    interview_id: UUID,
    body: ReviewResultRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Advance publication_state from INTERNAL_RESULT -> TPO_REVIEWED."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        interview = await conn.fetchval(
            "SELECT 1 FROM placement_interviews WHERE id = $1 AND organization_id = $2",
            interview_id, org_id,
        )
        if not interview:
            raise HTTPException(404, "Interview not found")

        result = await conn.fetchrow(
            "SELECT * FROM placement_interview_results WHERE interview_id = $1 AND is_current = TRUE",
            interview_id,
        )
        if not result:
            raise HTTPException(422, "No result has been entered for this interview yet.")
        if not _can_transition(result["publication_state"], "TPO_REVIEWED", _PUBLICATION_TRANSITIONS):
            raise HTTPException(422, f"Result is already in state '{result['publication_state']}'")

        await conn.execute(
            """UPDATE placement_interview_results
               SET publication_state = 'TPO_REVIEWED', reviewed_by = $1, reviewed_at = now()
               WHERE id = $2""",
            admin.user_id, result["id"],
        )
        await _audit(conn, admin.user_id, admin.email, "RESULT_REVIEWED",
                     "placement_interview_result", str(interview_id))
        await _emit_event(conn, "INTERVIEW_RESULT_REVIEWED",
                          interview_id=str(interview_id), actor_id=admin.user_id)
    return {"ok": True, "publication_state": "TPO_REVIEWED"}


@router.post("/{interview_id}/results/publish")
async def publish_result(
    interview_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Publish result to student. TPO_REVIEWED -> PUBLISHED_TO_STUDENT.
    Idempotent — re-publishing an already-published result is a safe no-op."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        interview = await conn.fetchrow(
            "SELECT * FROM placement_interviews WHERE id = $1 AND organization_id = $2",
            interview_id, org_id,
        )
        if not interview:
            raise HTTPException(404, "Interview not found")

        result = await conn.fetchrow(
            "SELECT * FROM placement_interview_results WHERE interview_id = $1 AND is_current = TRUE",
            interview_id,
        )
        if not result:
            raise HTTPException(422, "No result has been entered for this interview yet.")

        # Idempotency guard
        if result["publication_state"] == "PUBLISHED_TO_STUDENT":
            return {"ok": True, "publication_state": "PUBLISHED_TO_STUDENT", "idempotent": True}

        if not _can_transition(result["publication_state"], "PUBLISHED_TO_STUDENT", _PUBLICATION_TRANSITIONS):
            raise HTTPException(422,
                f"Result must be TPO_REVIEWED before publishing. "
                f"Current state: {result['publication_state']}")

        await conn.execute(
            """UPDATE placement_interview_results
               SET publication_state = 'PUBLISHED_TO_STUDENT', published_at = now()
               WHERE id = $1""",
            result["id"],
        )
        # Advance interview status to RESULT_PUBLISHED
        if _can_transition(interview["interview_status"], "RESULT_PUBLISHED", _INTERVIEW_TRANSITIONS):
            await conn.execute(
                "UPDATE placement_interviews SET interview_status = 'RESULT_PUBLISHED', updated_at = now() WHERE id = $1",
                interview_id,
            )
        await _audit(conn, admin.user_id, admin.email, "RESULT_PUBLISHED",
                     "placement_interview_result", str(interview_id),
                     new_value={"result": result["result"]})
        await _emit_event(conn, "INTERVIEW_RESULT_PUBLISHED",
                          interview_id=str(interview_id), drive_id=str(interview["drive_id"]),
                          student_id=str(interview["student_id"]), actor_id=admin.user_id,
                          payload={"result": result["result"]})
    return {"ok": True, "publication_state": "PUBLISHED_TO_STUDENT"}


@router.get("/analytics/summary")
async def analytics_summary(
    drive_id: Optional[str] = Query(None),
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Drive-level analytics: attendance rates, pass/fail/hold, turnaround.
    Implements Part 5 sections 44-48 data-sufficiency gate."""
    org_id = admin.organization_id
    MIN_SAMPLE = 5   # Part 5 section 45: readiness-vs-outcome gate

    try:
        async with DatabaseConnection() as conn:
            # Attendance breakdown
            att_q = "SELECT attendance_status, COUNT(*) AS c FROM placement_interviews WHERE organization_id = $1"
            params: list = [org_id]
            if drive_id:
                params.append(UUID(drive_id))
                att_q += f" AND drive_id = ${len(params)}"
            att_q += " GROUP BY attendance_status"
            att_rows = await conn.fetch(att_q, *params)
            att_counts = {r["attendance_status"]: int(r["c"]) for r in att_rows}
            total_att = sum(att_counts.values())
            present_like = att_counts.get("PRESENT", 0) + att_counts.get("LATE", 0)

            # Result rates (published only)
            res_q = """SELECT pir.result, COUNT(*) AS c
                       FROM placement_interview_results pir
                       JOIN placement_interviews pi ON pi.id = pir.interview_id
                       WHERE pi.organization_id = $1
                         AND pir.is_current = TRUE
                         AND pir.publication_state = 'PUBLISHED_TO_STUDENT'"""
            res_params: list = [org_id]
            if drive_id:
                res_params.append(UUID(drive_id))
                res_q += f" AND pi.drive_id = ${len(res_params)}"
            res_q += " GROUP BY pir.result"
            res_rows = await conn.fetch(res_q, *res_params)
            res_counts = {r["result"]: int(r["c"]) for r in res_rows}
            total_res = sum(res_counts.values())

            # Turnaround: avg hours from COMPLETED audit to published_at
            turn_q = """SELECT AVG(EXTRACT(EPOCH FROM (pir.published_at - pia.occurred_at))/3600) AS avg_hours
                        FROM placement_interview_results pir
                        JOIN placement_interviews pi ON pi.id = pir.interview_id
                        JOIN LATERAL (
                            SELECT occurred_at FROM placement_interview_audit
                            WHERE entity_type = 'placement_interview' AND entity_id = pi.id::text
                              AND action = 'ATTENDANCE_RECORDED'
                            ORDER BY occurred_at ASC LIMIT 1
                        ) pia ON TRUE
                        WHERE pi.organization_id = $1
                          AND pir.is_current = TRUE
                          AND pir.publication_state = 'PUBLISHED_TO_STUDENT'
                          AND pir.published_at IS NOT NULL"""
            turn_params: list = [org_id]
            if drive_id:
                turn_params.append(UUID(drive_id))
                turn_q += f" AND pi.drive_id = ${len(turn_params)}"
            turn_row = await conn.fetchrow(turn_q, *turn_params)
            avg_turnaround_hours = round(float(turn_row["avg_hours"]), 1) if turn_row and turn_row["avg_hours"] else None

    except Exception:
        return {"available": False}

    return {
        "available": True,
        "attendance": {
            "counts": att_counts,
            "attendance_rate": round(present_like / total_att, 4) if total_att else None,
            "absence_rate": round(att_counts.get("ABSENT", 0) / total_att, 4) if total_att else None,
        },
        "results": {
            "counts":       res_counts,
            "total":        total_res,
            "rates":        {k: round(v / total_res, 4) for k, v in res_counts.items()} if total_res else {},
            "data_sufficient": total_res >= MIN_SAMPLE,
        },
        "avg_result_turnaround_hours": avg_turnaround_hours,
    }