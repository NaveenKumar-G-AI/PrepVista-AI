import uuid

from pydantic import BaseModel


class ProfessionalProfileIn(BaseModel):
    headline: str | None = None
    preferred_roles: list[str] | None = None
    preferred_locations: list[str] | None = None
    salary_expectation_lpa: float | None = None
    career_interests: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None


class ProfessionalProfileOut(ProfessionalProfileIn):
    id: uuid.UUID
    student_id: uuid.UUID

    model_config = {"from_attributes": True}
