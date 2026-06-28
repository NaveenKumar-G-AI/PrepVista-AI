"""
PrepVista AI — STT WebSocket + REST Fallback (Fix 1, steps 4 & 5)
=================================================================
WebSocket:  /ws/stt/{session_id}   (real-time, primary)
REST:       POST /api/stt/transcribe  (whole-blob fallback when WS fails)

Both are gated by settings.STT_SERVER_ENABLED. While the flag is OFF the
endpoints return 503/close so the frontend keeps using its existing path.

WebSocket protocol (JSON control frames + binary audio frames)
--------------------------------------------------------------
client -> {"type": "turn_start", "turn_id": <int>}      start a new answer turn
client -> <binary webm/opus chunk>                       audio (every ~3s)
server -> {"type": "chunk_received", "chunk_n": <int>}   ack (frontend shows "listening...")
client -> {"type": "turn_end"}                           finish the turn
server -> {"type": "final", "final_transcript": ...,
           "raw_transcript": ..., "confidence": ...,
           "audio_id": ..., "audio_url": ...}             final result for the turn
server -> {"type": "error", "message": ...}               graceful failure

Why the FULL turn buffer is transcribed at turn_end (not each 3s chunk):
MediaRecorder timeslice chunks after the first do NOT carry the WebM header, so
chunks 2..N are not independently decodable. The server retains every chunk for
the audit trail but transcribes the concatenated, header-complete turn buffer —
which is always valid — at turn_end. Live UI shows "listening..." per the spec.

WebSocket state (per-turn audio buffer + chunk counter) is local to the single
worker holding the connection — inherently correct, since a WS lives on one
worker. No cross-worker state here.
"""

from __future__ import annotations

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, _decode_token_identity, get_current_user
from app.services.audio_storage import create_signed_url, record_audio_turn, store_audio_chunk
from app.services.stt_service import transcribe_audio

logger = structlog.get_logger("prepvista.stt_ws")

router = APIRouter()

# Cap the per-turn buffer so a misbehaving / malicious client cannot exhaust
# worker memory by streaming forever without a turn_end. ~15 MB of Opus is
# many minutes of speech — well beyond any real answer.
_MAX_TURN_BYTES = 15 * 1024 * 1024


async def _resolve_session_owner(session_id: str, auth_user_id: str, email: str) -> bool:
    """Return True if the token identity owns this interview session.

    Supabase issues the JWT `sub` as the auth user id, which equals
    profiles.id (= interview_sessions.user_id). Email is checked as a fallback
    in case of an id mismatch in older rows.
    """
    try:
        async with DatabaseConnection() as conn:
            row = await conn.fetchrow(
                """
                SELECT s.user_id, p.email
                FROM interview_sessions s
                JOIN profiles p ON p.id = s.user_id
                WHERE s.id = $1
                """,
                session_id,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("stt_ws_owner_lookup_failed", error=str(exc))
        return False
    if not row:
        return False
    return str(row["user_id"]) == str(auth_user_id) or (
        bool(email) and str(row["email"]).lower() == str(email).lower()
    )


@router.websocket("/ws/stt/{session_id}")
async def stt_websocket(websocket: WebSocket, session_id: str):
    settings = get_settings()

    # Feature gate — close before accepting if the server-side path is off.
    if not settings.STT_SERVER_ENABLED:
        await websocket.close(code=1013, reason="STT disabled")
        return

    # ── Auth via ?token= query param (browsers can't set WS headers) ──────────
    token = websocket.query_params.get("token") or ""
    identity = _decode_token_identity(token, settings) if token else None
    if not identity:
        await websocket.close(code=4401, reason="Unauthorized")
        return
    if not await _resolve_session_owner(session_id, identity["auth_user_id"], identity["email"]):
        await websocket.close(code=4403, reason="Forbidden")
        return

    await websocket.accept()

    # Per-turn state (local to this connection / worker).
    current_turn: object = 0
    chunk_n = 0
    buffer: list[bytes] = []
    buffered_bytes = 0
    resume_context: str | None = None

    def _reset_turn(turn_id: object) -> None:
        nonlocal current_turn, chunk_n, buffer, buffered_bytes
        current_turn = turn_id
        chunk_n = 0
        buffer = []
        buffered_bytes = 0

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # ── Binary audio chunk ────────────────────────────────────────────
            if message.get("bytes") is not None:
                data: bytes = message["bytes"]
                if buffered_bytes + len(data) > _MAX_TURN_BYTES:
                    await websocket.send_json(
                        {"type": "error", "message": "Turn audio too large; ending turn."}
                    )
                    continue
                buffer.append(data)
                buffered_bytes += len(data)
                chunk_n += 1
                # Retain each chunk best-effort (does not block on failure).
                await store_audio_chunk(session_id, current_turn, chunk_n, data)
                await websocket.send_json({"type": "chunk_received", "chunk_n": chunk_n})
                continue

            # ── JSON control frame ────────────────────────────────────────────
            text = message.get("text")
            if not text:
                continue

            import json
            try:
                control = json.loads(text)
            except (ValueError, TypeError):
                await websocket.send_json({"type": "error", "message": "Invalid control frame."})
                continue

            ctype = control.get("type")
            if ctype == "turn_start":
                _reset_turn(control.get("turn_id", 0))
                resume_context = control.get("resume_context") or resume_context
                await websocket.send_json({"type": "turn_started", "turn_id": current_turn})

            elif ctype == "turn_end":
                await _finalize_turn(
                    websocket, session_id, current_turn, buffer,
                    settings.STT_LANGUAGE_HINT, resume_context,
                )
                _reset_turn(current_turn)

            elif ctype == "close":
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("stt_ws_error", error=str(exc), session_id=session_id)
        try:
            await websocket.send_json(
                {"type": "error", "message": "Could not process audio, please try again."}
            )
        except Exception:
            pass


async def _finalize_turn(
    websocket: WebSocket,
    session_id: str,
    turn_id: object,
    buffer: list[bytes],
    language_hint: str,
    resume_context: str | None,
) -> None:
    full_audio = b"".join(buffer)
    if not full_audio:
        await websocket.send_json(
            {"type": "error", "message": "Could not process audio, please try again."}
        )
        return

    result = await transcribe_audio(
        full_audio, language_hint=language_hint, resume_context=resume_context
    )

    # Store the complete, playable turn blob and sign it for the audit trail.
    object_path = await store_audio_chunk(session_id, turn_id, "full", full_audio)
    audio_url = await create_signed_url(object_path) if object_path else None

    if result["provider"] == "none":
        await websocket.send_json(
            {"type": "error", "message": "Could not process audio, please try again."}
        )
        return

    # Persist the per-turn audio audit record so the report can re-mint a signed
    # playback URL and show transcription confidence (Fix 7). Best-effort.
    await record_audio_turn(
        session_id, turn_id, object_path, result["confidence"], result["provider"]
    )

    await websocket.send_json(
        {
            "type": "final",
            "turn_id": turn_id,
            "final_transcript": result["transcript"],
            "raw_transcript": result["raw_transcript"],
            "confidence": result["confidence"],
            "audio_id": result["audio_id"],
            "audio_url": audio_url,
        }
    )


@router.post("/api/stt/transcribe")
async def stt_transcribe_rest(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    turn_id: str = Form("0"),
    language_hint: str = Form("en-IN"),
    resume_context: str | None = Form(None),
    user: UserProfile = Depends(get_current_user),
):
    """Whole-blob STT fallback used when the WebSocket path is unavailable.

    Same return shape as the WebSocket 'final' frame. Verifies the caller owns
    the session before storing/transcribing.
    """
    settings = get_settings()
    if not settings.STT_SERVER_ENABLED:
        raise HTTPException(status_code=503, detail="Server-side STT is not enabled.")

    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            "SELECT user_id FROM interview_sessions WHERE id = $1", session_id
        )
    if not row or str(row["user_id"]) != str(user.id):
        raise HTTPException(status_code=404, detail="Interview session not found.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload.")
    if len(audio_bytes) > _MAX_TURN_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large.")

    result = await transcribe_audio(
        audio_bytes, language_hint=language_hint, resume_context=resume_context
    )
    if result["provider"] == "none":
        raise HTTPException(
            status_code=502, detail="Could not process audio, please try again."
        )

    object_path = await store_audio_chunk(session_id, turn_id, "full", audio_bytes)
    audio_url = await create_signed_url(object_path) if object_path else None

    # Persist the per-turn audio audit record for the report's audit trail (Fix 7).
    await record_audio_turn(
        session_id, turn_id, object_path, result["confidence"], result["provider"]
    )

    return {
        "final_transcript": result["transcript"],
        "raw_transcript": result["raw_transcript"],
        "confidence": result["confidence"],
        "audio_id": result["audio_id"],
        "audio_url": audio_url,
    }
