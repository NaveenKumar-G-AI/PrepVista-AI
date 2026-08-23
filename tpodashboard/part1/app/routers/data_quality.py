from fastapi import APIRouter

from app.deps import CurrentUser, DbSession, TenantId
from app.schemas.dashboard import DataQualityResponse
from app.services import data_quality_service

router = APIRouter(prefix="/data-quality", tags=["data-quality"])


@router.get("/students", response_model=DataQualityResponse)
def student_data_quality(db: DbSession, tenant_id: TenantId, _: CurrentUser) -> DataQualityResponse:
    result = data_quality_service.compute_data_quality(db, institution_id=tenant_id)
    return DataQualityResponse(**result)
