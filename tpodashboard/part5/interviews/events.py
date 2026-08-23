"""Part 5 — Event contract (section 54).

Same rule as audit.py: emit() writes to a connection it's given, never
opens its own, so it can never be nested inside another open writer
transaction.
"""

import json
from datetime import datetime, timezone

from .db import get_conn
from .enums import EventType


def _now():
    return datetime.now(timezone.utc).isoformat()


def emit(conn, event_type: EventType, payload: dict):
    conn.execute(
        "INSERT INTO event_log (event_type, payload, at) VALUES (?, ?, ?)",
        (event_type.value, json.dumps(payload), _now()),
    )


def recent(limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT event_type, payload, at FROM event_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [{"event_type": r["event_type"], "payload": json.loads(r["payload"]), "at": r["at"]} for r in rows]
