from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()

ProgramStatus = Literal["DRAFT", "SCHEDULED", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ARCHIVED"]
SessionMode = Literal["IN_PERSON", "ONLINE", "HYBRID"]

_PROGRAM_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"SCHEDULED", "CANCELLED"},
    "SCHEDULED": {"OPEN", "IN_PROGRESS", "CANCELLED"},
    "OPEN": {"IN_PROGRESS", "CANCELLED"},
    "IN_PROGRESS": {"COMPLETED", "CANCELLED"},
    "COMPLETED": {"ARCHIVED"},
    "CANCELLED": {"ARCHIVED"},
    "ARCHIVED": set(),
}


class CreateTrainingProgramRequest(BaseModel):
    seasonId: UUID
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    categoryId: UUID
    targetSkillIds: list[str] = Field(default_factory=list, max_length=100)
    trainerUserId: UUID | None = None
    capacity: int | None = Field(default=None, gt=0)
    startDate: datetime | None = None
    endDate: datetime | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "CreateTrainingProgramRequest":
        if self.startDate and self.endDate and self.endDate < self.startDate:
            raise ValueError("endDate must be on or after startDate")
        return self


@router.post("/programs", status_code=201)
async def create_program(
    req: CreateTrainingProgramRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    new_id = uuid4()
    async with DatabaseConnection() as conn:
        season_exists = await conn.fetchval(
            """SELECT 1 FROM placement_seasons
               WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'""",
            req.seasonId,
            admin.organization_id,
        )
        if not season_exists:
            raise HTTPException(422, "Placement season is not active for this organization")
        category_exists = await conn.fetchval(
            """SELECT 1 FROM taxonomy_term
               WHERE id = $1 AND institution_id = $2
                 AND domain = 'TRAINING_CATEGORY' AND is_active = TRUE""",
            req.categoryId,
            admin.organization_id,
        )
        if not category_exists:
            raise HTTPException(422, "Training category is not active for this organization")

        row = await conn.fetchrow(
            """INSERT INTO training_program
               (id, institution_id, season_id, name, description, category_id,
                target_skill_ids, trainer_user_id, capacity, start_date, end_date, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING *""",
            new_id,
            admin.organization_id,
            req.seasonId,
            req.name.strip(),
            req.description,
            req.categoryId,
            req.targetSkillIds,
            req.trainerUserId,
            req.capacity,
            req.startDate,
            req.endDate,
            admin.user_id,
        )
    return dict(row)


class TransitionProgramRequest(BaseModel):
    toStatus: ProgramStatus


@router.post("/programs/{program_id:uuid}/transition")
async def transition_program(
    program_id: UUID,
    req: TransitionProgramRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """SELECT status FROM training_program
                   WHERE id = $1 AND institution_id = $2 FOR UPDATE""",
                program_id,
                admin.organization_id,
            )
            if not row:
                raise HTTPException(404, "Training program not found")
            current_status = row["status"]
            if req.toStatus == current_status:
                return {"id": str(program_id), "status": current_status, "idempotent": True}
            if req.toStatus not in _PROGRAM_TRANSITIONS.get(current_status, set()):
                raise HTTPException(422, f"Cannot transition training program from {current_status} to {req.toStatus}")
            await conn.execute(
                "UPDATE training_program SET status = $1, updated_at = now() WHERE id = $2",
                req.toStatus,
                program_id,
            )
    return {"id": str(program_id), "status": req.toStatus}


@router.get("/programs/{program_id:uuid}")
async def get_program(
    program_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        program = await conn.fetchrow(
            "SELECT * FROM training_program WHERE id = $1 AND institution_id = $2",
            program_id,
            admin.organization_id,
        )
        if not program:
            raise HTTPException(404, "Training program not found")
        sessions = await conn.fetch(
            "SELECT * FROM training_session WHERE training_program_id = $1 ORDER BY scheduled_at",
            program_id,
        )
    return {"program": dict(program), "sessions": [dict(row) for row in sessions]}


class CreateSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    scheduledAt: datetime
    durationMinutes: int = Field(gt=0, le=1440)
    location: str | None = Field(default=None, max_length=500)
    mode: SessionMode
    trainerUserId: UUID | None = None
    capacity: int | None = Field(default=None, gt=0)


@router.post("/programs/{program_id:uuid}/sessions", status_code=201)
async def create_session(
    program_id: UUID,
    req: CreateSessionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    new_id = uuid4()
    async with DatabaseConnection() as conn:
        program = await conn.fetchrow(
            "SELECT status FROM training_program WHERE id = $1 AND institution_id = $2",
            program_id,
            admin.organization_id,
        )
        if not program:
            raise HTTPException(404, "Training program not found")
        if program["status"] in {"COMPLETED", "CANCELLED", "ARCHIVED"}:
            raise HTTPException(422, f"Cannot schedule sessions for a {program['status']} program")

        row = await conn.fetchrow(
            """INSERT INTO training_session
               (id, training_program_id, title, scheduled_at, duration_minutes,
                location, mode, trainer_user_id, capacity)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING *""",
            new_id,
            program_id,
            req.title.strip(),
            req.scheduledAt,
            req.durationMinutes,
            req.location,
            req.mode,
            req.trainerUserId,
            req.capacity,
        )
    return dict(row)
