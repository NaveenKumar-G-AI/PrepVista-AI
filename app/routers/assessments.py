from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID
from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()

class CreateAssessmentRequest(BaseModel):
    name: str
    categoryId: str
    skillIds: Optional[List[str]] = []

@router.post("/")
async def create_assessment(
    req: CreateAssessmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    import uuid
    new_id = uuid.uuid4()
    async with DatabaseConnection() as conn:
        await conn.execute(
            """
            INSERT INTO assessment 
            (id, institution_id, name, category_id, skill_ids, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            new_id, admin.organization_id, req.name, req.categoryId, req.skillIds, admin.id
        )
    return {"id": str(new_id), "name": req.name}

class CreateVersionRequest(BaseModel):
    durationMins: int
    maxScore: float
    passingScore: Optional[float] = None

@router.post("/{id}/versions")
async def create_assessment_version(
    id: str,
    req: CreateVersionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    import uuid
    new_id = uuid.uuid4()
    async with DatabaseConnection() as conn:
        # Check if assessment exists
        assm = await conn.fetchval("SELECT id FROM assessment WHERE id = $1 AND institution_id = $2", id, admin.organization_id)
        if not assm:
            raise HTTPException(status_code=404, detail="Assessment not found")
        
        # Get next version number
        max_ver = await conn.fetchval("SELECT MAX(version) FROM assessment_version WHERE assessment_id = $1", id)
        version_num = (max_ver or 0) + 1
        
        await conn.execute(
            """
            INSERT INTO assessment_version
            (id, assessment_id, version, duration_mins, max_score, passing_score, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
            """,
            new_id, id, version_num, req.durationMins, req.maxScore, req.passingScore
        )
    return {"id": str(new_id), "version": version_num, "status": "DRAFT"}

@router.post("/versions/{versionId}/publish")
async def publish_version(
    versionId: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        await conn.execute("UPDATE assessment_version SET status = 'PUBLISHED', published_at = now() WHERE id = $1", versionId)
    return {"status": "PUBLISHED"}
