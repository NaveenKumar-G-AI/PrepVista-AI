import uuid

from sqlalchemy.orm import Session

from app.models.activity import ActivityEvent


def emit(
    db: Session,
    *,
    institution_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    event_type: str,
    actor_user_id: uuid.UUID | None = None,
    season_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> ActivityEvent:
    event = ActivityEvent(
        institution_id=institution_id,
        season_id=season_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        event_metadata=metadata or {},
    )
    db.add(event)
    db.flush()
    return event
