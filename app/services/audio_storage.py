"""
PrepVista AI — Interview Audio Storage (Fix 1, steps 3 & 7)
===========================================================
Persists every captured audio chunk to a private Supabase Storage bucket so the
session can be replayed for dispute resolution, and mints short-lived signed
URLs for the report's audit trail.

Layout (per the spec):
    interview-audio/{session_id}/{turn_id}/{chunk_n}.webm

Bucket provisioning (done out-of-band by the operator — see deployment notes):
  * Bucket name = settings.INTERVIEW_AUDIO_BUCKET ("interview-audio")
  * PRIVATE (public = false). Audio is personal data; never world-readable.
  * The service-role key (server-only) is used for uploads + signing, so no RLS
    policy is required for the server path.
  * Retention: keep objects >= settings.AUDIO_RETENTION_DAYS (90). Configure a
    lifecycle/cron deletion in Supabase; the app never deletes audio itself.

Failure policy: storage is best-effort. A failed upload logs a warning and
returns None — it must NEVER break a live interview. The transcript still flows;
only the dispute-audio link is missing for that chunk.
"""

from __future__ import annotations

import structlog
import httpx

from app.config import get_settings
from app.database.connection import DatabaseConnection

logger = structlog.get_logger("prepvista.audio_storage")

# Signed URLs in the report are valid for 7 days — long enough for a student or
# TPO to review/dispute within a normal support window, short enough that a
# leaked link expires. Re-minted on each report render.
_SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600

_UPLOAD_TIMEOUT = 20.0
_SIGN_TIMEOUT = 10.0


def storage_object_path(session_id: str, turn_id: object, chunk_n: int) -> str:
    """Return the in-bucket object path for one audio chunk."""
    return f"{session_id}/{turn_id}/{chunk_n}.webm"


async def store_audio_chunk(
    session_id: str,
    turn_id: object,
    chunk_n: int,
    audio_bytes: bytes,
    *,
    content_type: str = "audio/webm",
) -> str | None:
    """Upload one audio chunk to the private bucket.

    Returns the in-bucket object path on success, or None on any failure /
    when storage is not configured. Never raises.
    """
    settings = get_settings()
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY):
        return None
    if not audio_bytes:
        return None

    bucket = settings.INTERVIEW_AUDIO_BUCKET
    object_path = storage_object_path(session_id, turn_id, chunk_n)
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}"

    try:
        async with httpx.AsyncClient(timeout=_UPLOAD_TIMEOUT) as client:
            resp = await client.post(
                url,
                content=audio_bytes,
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Content-Type": content_type,
                    # Overwrite if a retry re-sends the same chunk.
                    "x-upsert": "true",
                },
            )
        if resp.status_code >= 300:
            logger.warning(
                "audio_chunk_upload_failed",
                status=resp.status_code,
                session_id=session_id,
                turn_id=str(turn_id),
                chunk=chunk_n,
                detail=resp.text[:200],
            )
            return None
        return object_path
    except Exception as exc:  # noqa: BLE001 — never break the interview
        logger.warning(
            "audio_chunk_upload_error",
            error=str(exc),
            session_id=session_id,
            turn_id=str(turn_id),
            chunk=chunk_n,
        )
        return None


def _turn_number_from_turn_id(turn_id: object) -> int | None:
    """Coerce a turn id to the integer answer-turn it belongs to.

    REST sends a clean int ("0", "1", ...). The WebSocket records audio per
    rolling window with ids like "5-0", "5-1" — all part of answer turn 5 — so we
    take the leading integer. Returns None if no integer can be parsed (the audit
    row is then skipped rather than mis-keyed).
    """
    if isinstance(turn_id, int):
        return turn_id
    head = str(turn_id or "").strip().split("-", 1)[0]
    try:
        return int(head)
    except (TypeError, ValueError):
        return None


async def record_audio_turn(
    session_id: str,
    turn_id: object,
    object_path: str | None,
    confidence: float | None,
    provider: str | None,
) -> None:
    """Persist one answer turn's audio audit record (Fix 7). Best-effort; never raises.

    UPSERTs last-wins on (session_id, turn_number): for the WebSocket path the
    final window of a turn overwrites earlier ones, so the row holds the most
    complete object path + confidence. Skipped silently when storage produced no
    object path (storage disabled / upload failed) or the turn id has no integer.
    """
    if not object_path:
        return
    turn_number = _turn_number_from_turn_id(turn_id)
    if turn_number is None:
        return
    try:
        async with DatabaseConnection() as conn:
            await conn.execute(
                """
                INSERT INTO interview_audio_turns
                    (session_id, turn_number, audio_object_path, stt_confidence, stt_provider)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (session_id, turn_number) DO UPDATE SET
                    audio_object_path = EXCLUDED.audio_object_path,
                    stt_confidence    = EXCLUDED.stt_confidence,
                    stt_provider      = EXCLUDED.stt_provider,
                    updated_at        = now()
                """,
                session_id,
                turn_number,
                object_path,
                confidence,
                provider,
            )
    except Exception as exc:  # noqa: BLE001 — audit persistence must never break STT
        logger.warning(
            "audio_turn_record_failed",
            error=str(exc),
            session_id=session_id,
            turn_id=str(turn_id),
        )


async def create_signed_url(object_path: str, *, ttl_seconds: int = _SIGNED_URL_TTL_SECONDS) -> str | None:
    """Mint a time-limited signed URL for one stored object (report playback).

    Returns a fully-qualified URL or None on failure / when not configured.
    Never raises.
    """
    settings = get_settings()
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY and object_path):
        return None

    bucket = settings.INTERVIEW_AUDIO_BUCKET
    url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{object_path}"

    try:
        async with httpx.AsyncClient(timeout=_SIGN_TIMEOUT) as client:
            resp = await client.post(
                url,
                json={"expiresIn": int(ttl_seconds)},
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code >= 300:
            logger.warning(
                "audio_sign_failed",
                status=resp.status_code,
                object_path=object_path,
                detail=resp.text[:200],
            )
            return None
        signed = (resp.json() or {}).get("signedURL") or (resp.json() or {}).get("signedUrl")
        if not signed:
            return None
        # Supabase returns a path relative to /storage/v1.
        if signed.startswith("http"):
            return signed
        return f"{settings.SUPABASE_URL}/storage/v1{signed}"
    except Exception as exc:  # noqa: BLE001
        logger.warning("audio_sign_error", error=str(exc), object_path=object_path)
        return None
