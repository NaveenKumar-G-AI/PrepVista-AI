"""
PrepVista - Product funnel event tracking
Stores sparse, high-signal events used for growth and conversion analysis.
"""

from __future__ import annotations

import json
import re
from typing import Any

import asyncpg

ALLOWED_FUNNEL_EVENTS = {
    "landing page viewed",
    "cta clicked",
    "signup completed",
    "resume uploaded",
    "mock started",
    "mock completed",
    "pricing page viewed",
    "upgrade clicked",
}


def normalize_funnel_event_name(value: str) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", " ", text)


def _sanitize_scalar(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()[:200]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return None


def sanitize_funnel_metadata(metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}

    cleaned: dict[str, Any] = {}
    for raw_key, raw_value in list(metadata.items())[:16]:
        key = str(raw_key or "").strip().lower()[:64]
        if not key:
            continue

        scalar = _sanitize_scalar(raw_value)
        if scalar is not None or raw_value is None:
            cleaned[key] = scalar
            continue

        if isinstance(raw_value, list):
            compact_list = []
            for item in raw_value[:10]:
                item_scalar = _sanitize_scalar(item)
                if item_scalar is not None or item is None:
                    compact_list.append(item_scalar)
            if compact_list:
                cleaned[key] = compact_list

    encoded = json.dumps(cleaned, separators=(",", ":"))
    if len(encoded) > 2000:
        return {"trimmed": True}
    return cleaned


async def track_funnel_event(
    conn: asyncpg.Connection,
    event_name: str,
    *,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    normalized_name = normalize_funnel_event_name(event_name)
    if normalized_name not in ALLOWED_FUNNEL_EVENTS:
        raise ValueError(f"Unsupported funnel event: {event_name}")

    payload = sanitize_funnel_metadata(metadata or {})
    await conn.execute(
        """INSERT INTO product_funnel_events (event_name, user_id, metadata)
           VALUES ($1, $2, $3::jsonb)""",
        normalized_name,
        user_id,
        json.dumps(payload),
    )
