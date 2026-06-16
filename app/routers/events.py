"""
PrepVista - Product funnel events router
Public tracking endpoint with optional user resolution from bearer token.
"""

from __future__ import annotations

from typing import Any

import jwt
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.services.auth_identity import get_profile_id_for_auth_user
from app.services.funnel_tracking import (
    ALLOWED_FUNNEL_EVENTS,
    normalize_funnel_event_name,
    track_funnel_event,
)

router = APIRouter()
logger = structlog.get_logger("prepvista.events")


class TrackEventRequest(BaseModel):
    event_name: str = Field(..., min_length=3, max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split("Bearer ", 1)[1].strip()
    return token or None


def _decode_auth_user_id(token: str | None) -> str | None:
    if not token:
        return None
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id = str(payload.get("sub") or "").strip()
        return user_id or None
    except Exception:
        return None


@router.post("/track")
async def track_event(payload: TrackEventRequest, request: Request):
    normalized_name = normalize_funnel_event_name(payload.event_name)
    if normalized_name not in ALLOWED_FUNNEL_EVENTS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_event_name",
                "message": "Unsupported tracking event name.",
            },
        )

    auth_user_id = _decode_auth_user_id(_extract_bearer_token(request))
    profile_id: str | None = None

    async with DatabaseConnection() as conn:
        if auth_user_id:
            profile_id = await get_profile_id_for_auth_user(conn, auth_user_id)
            if not profile_id:
                legacy_profile_id = await conn.fetchval(
                    "SELECT id FROM profiles WHERE id = $1",
                    auth_user_id,
                )
                if legacy_profile_id:
                    profile_id = str(legacy_profile_id)

        await track_funnel_event(
            conn,
            normalized_name,
            user_id=profile_id,
            metadata=payload.metadata,
        )

    logger.info(
        "funnel_event_tracked",
        event_name=normalized_name,
        has_user=bool(profile_id),
    )
    return {"status": "ok"}
