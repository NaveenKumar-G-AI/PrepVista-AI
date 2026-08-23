import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.company import PipelineStage


class CompanyContactIn(BaseModel):
    name: str
    role_title: str | None = None
    email: str | None = None
    phone: str | None = None
    is_primary: bool = True
    last_contacted_at: date | None = None
    next_follow_up_at: date | None = None


class CompanyContactOut(CompanyContactIn):
    id: uuid.UUID
    company_id: uuid.UUID
    model_config = {"from_attributes": True}


class CompanyCreate(BaseModel):
    name: str
    industry: str | None = None
    website: str | None = None
    city: str | None = None
    pipeline_stage: PipelineStage = PipelineStage.PROSPECT
    notes: str | None = None


class CompanyUpdate(BaseModel):
    industry: str | None = None
    website: str | None = None
    city: str | None = None
    pipeline_stage: PipelineStage | None = None
    notes: str | None = None


class CompanyListItem(BaseModel):
    id: uuid.UUID
    name: str
    industry: str | None
    city: str | None
    pipeline_stage: PipelineStage
    drives_count: int = 0
    students_hired: int = 0
    model_config = {"from_attributes": True}


class CompanyDetail(BaseModel):
    id: uuid.UUID
    name: str
    industry: str | None
    website: str | None
    city: str | None
    pipeline_stage: PipelineStage
    notes: str | None
    created_at: datetime
    contacts: list[CompanyContactOut] = []
    model_config = {"from_attributes": True}


class CompanyListResponse(BaseModel):
    items: list[CompanyListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
