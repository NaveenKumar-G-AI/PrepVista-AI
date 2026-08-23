import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.models.drive import DriveStatus


class DriveCreate(BaseModel):
    company_id: uuid.UUID
    season_id: uuid.UUID | None = None
    role: str
    job_type: str = "FULL_TIME"
    ctc_lpa: float | None = None
    location: str | None = None
    min_cgpa: float = Field(default=0, ge=0, le=10)
    max_backlogs: int = Field(default=99, ge=0)
    eligible_department_ids: list[uuid.UUID] | None = None
    application_deadline: date | None = None
    drive_date: date | None = None
    status: DriveStatus = DriveStatus.DRAFT


class DriveUpdate(BaseModel):
    role: str | None = None
    ctc_lpa: float | None = None
    location: str | None = None
    min_cgpa: float | None = None
    max_backlogs: int | None = None
    eligible_department_ids: list[uuid.UUID] | None = None
    application_deadline: date | None = None
    drive_date: date | None = None
    status: DriveStatus | None = None


class DriveListItem(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    role: str
    ctc_lpa: float | None
    location: str | None
    status: DriveStatus
    application_deadline: date | None
    applicant_count: int = 0
    model_config = {"from_attributes": True}


class DriveListResponse(BaseModel):
    items: list[DriveListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class DriveDetail(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    role: str
    job_type: str
    ctc_lpa: float | None
    location: str | None
    status: DriveStatus
    min_cgpa: float
    max_backlogs: int
    eligible_department_ids: list[uuid.UUID] | None
    application_deadline: date | None
    drive_date: date | None


class EligibilityRequest(BaseModel):
    min_cgpa: float = Field(ge=0, le=10)
    max_backlogs: int = Field(ge=0)
    department_ids: list[uuid.UUID] | None = None


class EligibilityResponse(BaseModel):
    total: int
    eligible: int
    not_eligible: int
    cgpa_fail: int
    backlog_fail: int
    dept_fail: int


class InterviewRoundIn(BaseModel):
    name: str
    sequence_order: int = 0


class InterviewRoundOut(InterviewRoundIn):
    id: uuid.UUID
    drive_id: uuid.UUID
    model_config = {"from_attributes": True}
