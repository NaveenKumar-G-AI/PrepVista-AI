import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.application import ApplicationStage, RoundResult, ScheduleStatus
from app.models.offer import OfferStatus


class ApplicationCreate(BaseModel):
    drive_id: uuid.UUID
    student_id: uuid.UUID


class ApplicationStageUpdate(BaseModel):
    stage: ApplicationStage


class ApplicationOut(BaseModel):
    id: uuid.UUID
    drive_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    stage: ApplicationStage
    applied_at: datetime
    model_config = {"from_attributes": True}


class FunnelStageCount(BaseModel):
    stage: str
    count: int


class DriveFunnelResponse(BaseModel):
    drive_id: uuid.UUID
    eligible_count: int
    stages: list[FunnelStageCount]


class InterviewScheduleCreate(BaseModel):
    application_id: uuid.UUID
    round_id: uuid.UUID
    scheduled_at: datetime | None = None
    interviewer_name: str | None = None


class InterviewScheduleUpdate(BaseModel):
    status: ScheduleStatus | None = None
    result: RoundResult | None = None
    feedback: str | None = None
    scheduled_at: datetime | None = None


class InterviewScheduleOut(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    round_id: uuid.UUID
    round_name: str
    student_name: str
    scheduled_at: datetime | None
    status: ScheduleStatus
    result: RoundResult
    interviewer_name: str | None
    feedback: str | None
    model_config = {"from_attributes": True}


class OfferUpdate(BaseModel):
    status: OfferStatus | None = None
    joining_confirmed: bool | None = None
    joining_date: date | None = None


class OfferOut(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    company_id: uuid.UUID
    company_name: str
    ctc_lpa: float | None
    status: OfferStatus
    extended_at: datetime
    expiry_date: date | None
    accepted_at: datetime | None
    joining_date: date | None
    joining_confirmed: bool
    model_config = {"from_attributes": True}


class OfferListResponse(BaseModel):
    items: list[OfferOut]
    total: int
    page: int
    page_size: int
    total_pages: int
