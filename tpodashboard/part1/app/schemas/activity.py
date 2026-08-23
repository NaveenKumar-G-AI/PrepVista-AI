import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityEventOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    event_type: str
    event_metadata: dict | None
    actor_user_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
