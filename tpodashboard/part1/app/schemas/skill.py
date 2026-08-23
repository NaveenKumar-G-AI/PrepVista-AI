import uuid

from pydantic import BaseModel


class StudentSkillOut(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    skill_name: str
    category: str | None
    proficiency: int | None
    source: str
    verified: bool

    model_config = {"from_attributes": True}
