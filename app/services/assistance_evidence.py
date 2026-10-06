"""Persisted, owner-scoped view evidence for one answer operation."""
import json


def content_present(value):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        envelope = json.loads(value)
    except (ValueError, TypeError):
        return True  # Authentic historical plain-text content.
    return isinstance(envelope, dict) and isinstance(envelope.get("content"), str) and bool(envelope["content"].strip())


async def resolve_provenance(conn, session_id, instance, owner, answered_at, turn=None):
    if not instance:
        return "unknown"
    events = await conn.fetch("""SELECT id, user_id, assistance_type, generated_at,
        generated_content, viewed_at, model_provider FROM interview_assistance_event
        WHERE session_id = $1 AND question_instance_id = $2 AND invalidated = FALSE
          AND viewed_at IS NOT NULL AND viewed_at < $3""", session_id, instance, answered_at)
    legacy = await conn.fetchval("""SELECT count(*) FROM interview_assistance_event
        WHERE session_id = $1 AND turn_number = $2 AND question_instance_id IS NULL
          AND invalidated = FALSE AND viewed_at IS NOT NULL AND viewed_at < $3""",
        session_id, turn, answered_at) if turn is not None else 0
    valid, incomplete = [], bool(legacy)
    for event in events:
        if event.get("user_id") is not None and str(event["user_id"]) != str(owner):
            continue
        generated, viewed = event.get("generated_at"), event.get("viewed_at")
        if (event.get("user_id") is None or not generated or generated > viewed
                or not content_present(event.get("generated_content"))
                or event.get("model_provider") == "fallback"
                or event.get("assistance_type") not in {"hint", "answer_guidance"}):
            incomplete = True
            continue
        valid.append(event)
    for event in valid:
        await conn.execute("UPDATE interview_assistance_event SET used_before_answer = TRUE WHERE id = $1", event["id"])
    kinds = {event["assistance_type"] for event in valid}
    if "answer_guidance" in kinds:
        return "answer_guided"
    if "hint" in kinds:
        return "hint_assisted"
    return "unknown" if incomplete else "independent"


PROVENANCE_LABELS = {"independent": "Independent Attempt", "hint_assisted": "Hint Assisted", "answer_guided": "Answer Guided"}

def provenance_label(value):
    return PROVENANCE_LABELS.get(value, "Unknown")
