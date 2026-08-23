import uuid

from pydantic import BaseModel, Field


class AcademicRecordIn(BaseModel):
    semester: int = 0
    gpa: float | None = None
    cumulative_cgpa: float | None = Field(default=None, ge=0, le=10)
    percentage: float | None = Field(default=None, ge=0, le=100)
    backlog_count: int = Field(default=0, ge=0)
    active_backlog_count: int = Field(default=0, ge=0)
    academic_status: str | None = None


class AcademicRecordOut(AcademicRecordIn):
    id: uuid.UUID
    student_id: uuid.UUID
    verified: bool
    source: str

    model_config = {"from_attributes": True}
