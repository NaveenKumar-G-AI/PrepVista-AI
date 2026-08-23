from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentUser, DbSession, TenantId
from app.models.institution import Batch, Department, PlacementSeason, Program
from app.schemas.institution import BatchOut, DepartmentOut, ProgramOut, SeasonOut

router = APIRouter(tags=["institution"])


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[DepartmentOut]:
    rows = db.execute(
        select(Department).where(Department.institution_id == tenant_id, Department.is_active.is_(True)).order_by(Department.name)
    ).scalars().all()
    return [DepartmentOut.model_validate(r) for r in rows]


@router.get("/programs", response_model=list[ProgramOut])
def list_programs(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[ProgramOut]:
    rows = db.execute(
        select(Program).where(Program.institution_id == tenant_id, Program.is_active.is_(True)).order_by(Program.name)
    ).scalars().all()
    return [ProgramOut.model_validate(r) for r in rows]


@router.get("/batches", response_model=list[BatchOut])
def list_batches(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[BatchOut]:
    rows = db.execute(
        select(Batch).where(Batch.institution_id == tenant_id, Batch.is_active.is_(True)).order_by(Batch.graduation_year.desc())
    ).scalars().all()
    return [BatchOut.model_validate(r) for r in rows]


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> list[SeasonOut]:
    rows = db.execute(
        select(PlacementSeason).where(PlacementSeason.institution_id == tenant_id).order_by(PlacementSeason.start_date.desc())
    ).scalars().all()
    return [SeasonOut.model_validate(r) for r in rows]
