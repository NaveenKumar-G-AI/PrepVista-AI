from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter()


class CreateAssessmentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    categoryId: UUID
    skillIds: list[str] = Field(default_factory=list, max_length=100)


@router.post("/", status_code=201)
async def create_assessment(
    req: CreateAssessmentRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    new_id = uuid4()
    async with DatabaseConnection() as conn:
        category_exists = await conn.fetchval(
            """SELECT 1 FROM taxonomy_term
               WHERE id = $1 AND institution_id = $2
                 AND domain = 'ASSESSMENT_CATEGORY' AND is_active = TRUE""",
            req.categoryId,
            admin.organization_id,
        )
        if not category_exists:
            raise HTTPException(422, "Assessment category is not active for this organization")
        row = await conn.fetchrow(
            """INSERT INTO assessment
               (id, institution_id, name, category_id, skill_ids, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *""",
            new_id,
            admin.organization_id,
            req.name.strip(),
            req.categoryId,
            req.skillIds,
            admin.user_id,
        )
    return dict(row)


class CreateVersionRequest(BaseModel):
    durationMins: int = Field(gt=0, le=1440)
    maxScore: float = Field(gt=0)
    passingScore: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_passing_score(self) -> "CreateVersionRequest":
        if self.passingScore is not None and self.passingScore > self.maxScore:
            raise ValueError("passingScore cannot exceed maxScore")
        return self


@router.post("/{assessment_id:uuid}/versions", status_code=201)
async def create_assessment_version(
    assessment_id: UUID,
    req: CreateVersionRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    new_id = uuid4()
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            assessment = await conn.fetchval(
                """SELECT id FROM assessment
                   WHERE id = $1 AND institution_id = $2 FOR UPDATE""",
                assessment_id,
                admin.organization_id,
            )
            if not assessment:
                raise HTTPException(404, "Assessment not found")

            max_version = await conn.fetchval(
                "SELECT MAX(version) FROM assessment_version WHERE assessment_id = $1",
                assessment_id,
            )
            version_number = int(max_version or 0) + 1
            row = await conn.fetchrow(
                """INSERT INTO assessment_version
                   (id, assessment_id, version, duration_mins, max_score, passing_score, status)
                   VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
                   RETURNING *""",
                new_id,
                assessment_id,
                version_number,
                req.durationMins,
                req.maxScore,
                req.passingScore,
            )
    return dict(row)


@router.post("/versions/{version_id:uuid}/publish")
async def publish_version(
    version_id: UUID,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            version = await conn.fetchrow(
                """SELECT av.id, av.assessment_id, av.status
                   FROM assessment_version av
                   JOIN assessment a ON a.id = av.assessment_id
                   WHERE av.id = $1 AND a.institution_id = $2
                   FOR UPDATE OF av""",
                version_id,
                admin.organization_id,
            )
            if not version:
                raise HTTPException(404, "Assessment version not found")
            if version["status"] == "PUBLISHED":
                return {"id": str(version_id), "status": "PUBLISHED", "idempotent": True}
            if version["status"] != "DRAFT":
                raise HTTPException(422, f"Cannot publish a version in {version['status']} state")

            await conn.execute(
                """UPDATE assessment_version SET status = 'RETIRED'
                   WHERE assessment_id = $1 AND status = 'PUBLISHED'""",
                version["assessment_id"],
            )
            await conn.execute(
                """UPDATE assessment_version
                   SET status = 'PUBLISHED', published_at = now()
                   WHERE id = $1""",
                version_id,
            )
    return {"id": str(version_id), "status": "PUBLISHED"}
