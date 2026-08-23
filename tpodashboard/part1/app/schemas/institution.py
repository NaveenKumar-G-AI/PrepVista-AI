import uuid
from datetime import date

from pydantic import BaseModel


class DepartmentOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    is_active: bool
    model_config = {"from_attributes": True}


class ProgramOut(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    code: str
    name: str
    degree_level: str | None
    is_active: bool
    model_config = {"from_attributes": True}


class BatchOut(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    name: str
    graduation_year: int
    is_active: bool
    model_config = {"from_attributes": True}


class SeasonOut(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date | None
    end_date: date | None
    is_active: bool
    model_config = {"from_attributes": True}


class InstitutionOut(BaseModel):
    id: uuid.UUID
    name: str
    short_code: str
    is_active: bool
    model_config = {"from_attributes": True}
