import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditRecord


def record(
    db: Session,
    *,
    institution_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    metadata: dict | None = None,
) -> AuditRecord:
    entry = AuditRecord(
        institution_id=institution_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        event_metadata=metadata or {},
    )
    db.add(entry)
    db.flush()
    return entry
