from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()

class CreateTrainingProgramRequest(BaseModel):
    seasonId: str
    name: str
    description: Optional[str] = None
    categoryId: str
    targetSkillIds: Optional[List[str]] = []
    trainerUserId: Optional[str] = None
    capacity: Optional[int] = None
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None

@router.post("/programs")
async def create_program(
    req: CreateTrainingProgramRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    import uuid
    new_id = uuid.uuid4()
    async with DatabaseConnection() as conn:
        await conn.execute(
            """
            INSERT INTO training_program 
            (id, institution_id, season_id, name, description, category_id, target_skill_ids, trainer_user_id, capacity, start_date, end_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
            new_id, admin.organization_id, req.seasonId, req.name, req.description, req.categoryId, 
            req.targetSkillIds, req.trainerUserId, req.capacity, req.startDate, req.endDate, admin.id
        )
    return {"id": str(new_id), "status": "DRAFT", "name": req.name}

class TransitionProgramRequest(BaseModel):
    toStatus: str

@router.post("/programs/{id}/transition")
async def transition_program(
    id: str,
    req: TransitionProgramRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE training_program SET status = $1, updated_at = now() WHERE id = $2 AND institution_id = $3", req.toStatus, id, admin.organization_id)
    return {"id": id, "status": req.toStatus}

@router.get("/programs/{id}")
async def get_program(
    id: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        prog = await conn.fetchrow("SELECT * FROM training_program WHERE id = $1 AND institution_id = $2", id, admin.organization_id)
        if not prog:
            raise HTTPException(status_code=404, detail="Program not found")
        return dict(prog)

class CreateSessionRequest(BaseModel):
    title: str
    scheduledAt: datetime
    durationMinutes: int
    location: Optional[str] = None
    mode: str
    trainerUserId: Optional[str] = None
    capacity: Optional[int] = None

@router.post("/programs/{id}/sessions")
async def create_session(
    id: str,
    req: CreateSessionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    import uuid
    new_id = uuid.uuid4()
    async with DatabaseConnection() as conn:
        await conn.execute(
            """
            INSERT INTO training_session 
            (id, training_program_id, title, scheduled_at, duration_minutes, location, mode, trainer_user_id, capacity)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            new_id, id, req.title, req.scheduledAt, req.durationMinutes, req.location, req.mode, req.trainerUserId, req.capacity
        )
    return {"id": str(new_id), "title": req.title}
