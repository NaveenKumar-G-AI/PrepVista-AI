import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.student import Gender, PlacementStatus, StudentStatus


class StudentBase(BaseModel):
    register_number: str = Field(min_length=1, max_length=64)
    roll_number: str | None = None
    full_name: str = Field(min_length=1, max_length=255)
    institutional_email: EmailStr | None = None
    personal_email: EmailStr | None = None
    phone: str | None = None
    gender: Gender | None = None
    date_of_birth: date | None = None


class StudentCreate(StudentBase):
    batch_id: uuid.UUID
    department_id: uuid.UUID
    program_id: uuid.UUID
    season_id: uuid.UUID | None = None


class StudentUpdate(BaseModel):
    roll_number: str | None = None
    full_name: str | None = None
    institutional_email: EmailStr | None = None
    personal_email: EmailStr | None = None
    phone: str | None = None
    gender: Gender | None = None
    date_of_birth: date | None = None
    status: StudentStatus | None = None
    placement_status: PlacementStatus | None = None


class StudentListItem(BaseModel):
    id: uuid.UUID
    register_number: str
    full_name: str
    department_id: uuid.UUID
    batch_id: uuid.UUID
    placement_status: PlacementStatus
    status: StudentStatus
    profile_completion_pct: int
    institutional_email: str | None
    phone: str | None

    model_config = {"from_attributes": True}


class StudentListResponse(BaseModel):
    items: list[StudentListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class StudentDetail(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    season_id: uuid.UUID | None
    batch_id: uuid.UUID
    department_id: uuid.UUID
    program_id: uuid.UUID
    register_number: str
    roll_number: str | None
    full_name: str
    institutional_email: str | None
    personal_email: str | None
    phone: str | None
    gender: Gender | None
    date_of_birth: date | None
    status: StudentStatus
    placement_status: PlacementStatus
    profile_completion_pct: int
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
