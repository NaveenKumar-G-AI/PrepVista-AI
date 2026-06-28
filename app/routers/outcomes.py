"""
PrepVista AI — Placement Outcomes API (Fix 3)
=============================================
Lets a TPO record real hiring outcomes for their students' interview sessions
("placed at TCS: yes/no"). These labels feed app/services/calibration.py, which
fits the per-company hiring-probability curve from real data instead of
hardcoded heuristics.

Mounted at /api/outcomes (see app/main.py). All endpoints require the org-admin
(TPO) role via require_org_admin(); the outcome's college_id is taken from the
authenticated admin's organization, never from the request body.

NOTE on path: the rest of this codebase mounts routers at root-level prefixes
(/auth, /interviews, ...). This router is mounted at /api/outcomes specifically
to match the Fix 3 spec's POST /api/outcomes/submit endpoint.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin
from app.services.calibration import calibrate_company_parameters

logger = structlog.get_logger("prepvista.outcomes")

router = APIRouter()


class OutcomeSubmission(BaseModel):
    session_id: str
    company_name: str
    placed: bool
    round: str | None = None

    @field_validator("company_name")
    @classmethod
    def _company_not_blank(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("company_name is required")
        return cleaned

    @field_validator("session_id")
    @classmethod
    def _session_uuid(cls, value: str) -> str:
        import uuid
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("session_id must be a valid UUID")


@router.post("/submit")
async def submit_outcome(
    body: OutcomeSubmission,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Record (or update) a placement outcome for one student session.

    The session must belong to a student in the calling TPO's organization —
    enforced by joining interview_sessions -> the org's students. This both
    authorises the write and binds the correct college_id.
    """
    org_id = admin.organization_id

    async with DatabaseConnection() as conn:
        # Verify the session belongs to a student in this TPO's organization.
        owner = await conn.fetchrow(
            """
            SELECT s.id
            FROM interview_sessions s
            JOIN organization_students os ON os.user_id = s.user_id
            WHERE s.id = $1 AND os.organization_id = $2
            """,
            body.session_id,
            org_id,
        )
        if not owner:
            # Do not leak whether the session exists for another org.
            raise HTTPException(
                status_code=404,
                detail="Interview session not found for your organization.",
            )

        await conn.execute(
            """
            INSERT INTO placement_outcomes
                (session_id, college_id, company_name, placed, interview_round)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, company_name) DO UPDATE
                SET placed = EXCLUDED.placed,
                    interview_round = EXCLUDED.interview_round,
                    created_at = now()
            """,
            body.session_id,
            org_id,
            body.company_name,
            body.placed,
            body.round,
        )

    logger.info(
        "placement_outcome_submitted",
        org_id=str(org_id),
        company=body.company_name,
        placed=body.placed,
    )
    return {"status": "recorded", "company_name": body.company_name, "placed": body.placed}


@router.post("/calibrate/{company_name}")
async def calibrate_company(
    company_name: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Trigger a recalibration of one company's hiring-probability curve.

    Returns the calibration status (calibrated / insufficient_data / ...). Below
    the minimum sample size the company keeps its heuristic curve. Available to
    TPOs so they can refresh after submitting a batch of outcomes; calibration
    also runs at startup and is cached for an hour.
    """
    result = await calibrate_company_parameters(company_name)
    return result
