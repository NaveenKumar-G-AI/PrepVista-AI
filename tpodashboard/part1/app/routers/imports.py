from fastapi import APIRouter, UploadFile

from app.config import get_settings
from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import ValidationAppError
from app.schemas.importing import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    ImportValidateRequest,
    ImportValidateResponse,
)
from app.services import import_service

router = APIRouter(prefix="/students/import", tags=["import"])
settings = get_settings()


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    db: DbSession, tenant_id: TenantId, current_user: CurrentUser, file: UploadFile
) -> ImportPreviewResponse:
    if not file.filename:
        raise ValidationAppError("No file provided.")
    content = await file.read()
    if not content:
        raise ValidationAppError("Uploaded file is empty.")

    result = import_service.create_preview(
        db,
        institution_id=tenant_id,
        uploaded_by_user_id=current_user.id,
        filename=file.filename,
        content=content,
        max_rows=settings.import_max_rows,
    )
    db.commit()
    return ImportPreviewResponse(**result)


@router.post("/validate", response_model=ImportValidateResponse)
def validate_import(payload: ImportValidateRequest, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> ImportValidateResponse:
    result = import_service.validate_import(
        db,
        institution_id=tenant_id,
        import_batch_id=payload.import_batch_id,
        column_mapping=payload.column_mapping,
        batch_id=payload.batch_id,
        department_id=payload.department_id,
        program_id=payload.program_id,
    )
    db.commit()
    return ImportValidateResponse(**result)


@router.post("/commit", response_model=ImportCommitResponse)
def commit_import(payload: ImportCommitRequest, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> ImportCommitResponse:
    try:
        result = import_service.commit_import(
            db,
            institution_id=tenant_id,
            actor_user_id=current_user.id,
            import_batch_id=payload.import_batch_id,
            skip_duplicates=payload.skip_duplicates,
        )
    except Exception:
        db.rollback()
        raise
    db.commit()
    return ImportCommitResponse(**result)
