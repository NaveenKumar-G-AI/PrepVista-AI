import math
import uuid

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from app.deps import CurrentUser, DbSession, TenantId
from app.exceptions import ConflictError, NotFoundError
from app.models.student import PlacementStatus, Student, StudentStatus
from app.schemas.student import StudentCreate, StudentDetail, StudentListResponse, StudentUpdate
from app.services import activity_service, audit_service
from app.services.profile_completion import compute_profile_completion

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=StudentListResponse)
def list_students(
    db: DbSession,
    tenant_id: TenantId,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: str | None = None,
    department_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
    placement_status: PlacementStatus | None = None,
    status_: StudentStatus | None = Query(None, alias="status"),
    sort_by: str = Query("full_name", pattern="^(full_name|register_number|profile_completion_pct|created_at)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
) -> StudentListResponse:
    stmt = select(Student).where(Student.institution_id == tenant_id)
    count_stmt = select(func.count()).select_from(Student).where(Student.institution_id == tenant_id)

    if search:
        pattern = f"%{search.strip()}%"
        clause = or_(
            Student.full_name.ilike(pattern),
            Student.register_number.ilike(pattern),
            Student.roll_number.ilike(pattern),
            Student.institutional_email.ilike(pattern),
            Student.phone.ilike(pattern),
        )
        stmt = stmt.where(clause)
        count_stmt = count_stmt.where(clause)
    if department_id:
        stmt = stmt.where(Student.department_id == department_id)
        count_stmt = count_stmt.where(Student.department_id == department_id)
    if batch_id:
        stmt = stmt.where(Student.batch_id == batch_id)
        count_stmt = count_stmt.where(Student.batch_id == batch_id)
    if placement_status:
        stmt = stmt.where(Student.placement_status == placement_status)
        count_stmt = count_stmt.where(Student.placement_status == placement_status)
    if status_:
        stmt = stmt.where(Student.status == status_)
        count_stmt = count_stmt.where(Student.status == status_)

    sort_col = getattr(Student, sort_by)
    stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    total = db.execute(count_stmt).scalar_one()
    items = db.execute(stmt).scalars().all()

    return StudentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    )


@router.post("", response_model=StudentDetail, status_code=201)
def create_student(payload: StudentCreate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser) -> StudentDetail:
    existing = db.execute(
        select(Student).where(Student.institution_id == tenant_id, Student.register_number == payload.register_number)
    ).scalar_one_or_none()
    if existing:
        raise ConflictError(f"A student with register number '{payload.register_number}' already exists.")

    student = Student(institution_id=tenant_id, source="manual", **payload.model_dump())
    student.profile_completion_pct = compute_profile_completion(student)
    db.add(student)
    db.flush()

    activity_service.emit(
        db, institution_id=tenant_id, entity_type="student", entity_id=student.id,
        event_type="student.created", actor_user_id=current_user.id, metadata={"source": "manual"},
    )
    audit_service.record(
        db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="student",
        entity_id=student.id, action="CREATE",
    )
    db.commit()
    db.refresh(student)
    return StudentDetail.model_validate(student)


@router.get("/{student_id}", response_model=StudentDetail)
def get_student(student_id: uuid.UUID, db: DbSession, tenant_id: TenantId, _: CurrentUser) -> StudentDetail:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")
    return StudentDetail.model_validate(student)


@router.patch("/{student_id}", response_model=StudentDetail)
def update_student(
    student_id: uuid.UUID, payload: StudentUpdate, db: DbSession, tenant_id: TenantId, current_user: CurrentUser
) -> StudentDetail:
    student = db.get(Student, student_id)
    if not student or student.institution_id != tenant_id:
        raise NotFoundError("Student not found.")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(student, field, value)
    student.profile_completion_pct = compute_profile_completion(student)
    db.flush()

    activity_service.emit(
        db, institution_id=tenant_id, entity_type="student", entity_id=student.id,
        event_type="student.updated", actor_user_id=current_user.id, metadata={"fields": list(changes.keys())},
    )
    audit_service.record(
        db, institution_id=tenant_id, actor_user_id=current_user.id, entity_type="student",
        entity_id=student.id, action="UPDATE", metadata={"fields": list(changes.keys())},
    )
    db.commit()
    db.refresh(student)
    return StudentDetail.model_validate(student)
