"""Part 5 — Audit trail. Section 55.

record() takes an OPEN connection and writes to it — it does not manage
its own transaction. This is deliberate: every mutating function in
scheduling.py / results.py / import_pipeline.py opens exactly one
connection for its whole operation and passes it down, so the audit
entry commits atomically with the change it describes (never one
without the other), and no code path ever opens a second writer
connection while the first is still mid-transaction (SQLite will lock
against itself if you do that).
"""

import json
from datetime import datetime, timezone

from .db import get_conn


def _now():
    return datetime.now(timezone.utc).isoformat()


def record(conn, actor: str, action: str, entity_type: str, entity_id: str,
           old_value=None, new_value=None, reason: str = None, metadata: dict = None):
    conn.execute(
        """INSERT INTO audit_log (actor, action, entity_type, entity_id, old_value,
                                   new_value, reason, metadata, at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (actor, action, entity_type, entity_id,
         json.dumps(old_value) if old_value is not None else None,
         json.dumps(new_value) if new_value is not None else None,
         reason,
         json.dumps(metadata) if metadata else None,
         _now()),
    )


def trail_for(entity_type: str, entity_id: str):
    """Read-only — safe to own its own connection."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT actor, action, old_value, new_value, reason, metadata, at
               FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY at ASC""",
            (entity_type, entity_id),
        ).fetchall()
        return [dict(r) for r in rows]
