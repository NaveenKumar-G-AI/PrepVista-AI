"""
PrepVista AI — Server-side Speech-to-Text (Fix 1, step 2)
=========================================================
Transcribes interview audio on the server so voice interviews work on every
browser (Chrome, Firefox, Safari, Edge), audio is retained for disputes, and
the transcript no longer depends on the client's Web Speech API.

Providers:
  * PRIMARY — Groq Whisper (model=whisper-large-v3) via the groq SDK. Reuses
    GROQ_API_KEY; available today.
  * SECONDARY (optional) — Deepgram Nova-2 over REST. Inert unless
    DEEPGRAM_API_KEY is set. Used only when Groq fails.

transcribe_audio() returns the spec shape:
    {
      "transcript":     "<resume-normalised text>",   # light dictionary cleanup
      "raw_transcript":  "<verbatim engine output>",
      "confidence":      0.0-1.0,
      "audio_id":        "<uuid>",
      "provider":        "groq" | "deepgram" | "none",
    }

The heavy resume-grounded LLM repair (Fix 2) runs later in the scoring path
(evaluator_scoring), so STT only applies the cheap deterministic
``normalize_transcript`` cleanup here — repairing twice would waste tokens.
"""

from __future__ import annotations

import io
import uuid

import httpx
import structlog

from app.config import get_settings
from app.services.transcript import normalize_transcript

logger = structlog.get_logger("prepvista.stt")

_DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
_GROQ_TIMEOUT = 25.0
_DEEPGRAM_TIMEOUT = 25.0

# Lazy singleton groq client (the groq SDK manages its own httpx pool).
_groq_async = None


def _get_groq():
    global _groq_async
    if _groq_async is None:
        from groq import AsyncGroq
        _groq_async = AsyncGroq(api_key=get_settings().GROQ_API_KEY)
    return _groq_async


def _normalize_language(language_hint: str | None) -> str:
    """Whisper/Deepgram want a base language code ('en'), not a locale ('en-IN')."""
    if not language_hint:
        return get_settings().STT_LANGUAGE_HINT or "en"
    return language_hint.split("-")[0].strip().lower() or "en"


async def _transcribe_groq(audio_bytes: bytes, language: str) -> tuple[str, float] | None:
    """Groq Whisper. Returns (text, confidence) or None on failure."""
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        return None
    try:
        client = _get_groq()
        buf = io.BytesIO(audio_bytes)
        # The SDK accepts a (filename, fileobj) tuple; the extension hints format.
        resp = await client.audio.transcriptions.create(
            file=("chunk.webm", buf),
            model=settings.GROQ_WHISPER_MODEL,
            language=language,
            response_format="verbose_json",
            temperature=0.0,
        )
        text = (getattr(resp, "text", None) or "").strip()
        # Whisper exposes per-segment avg_logprob; convert to a rough 0-1
        # confidence. Absent that, assume a solid-but-not-certain 0.8.
        confidence = _confidence_from_groq(resp)
        return text, confidence
    except Exception as exc:  # noqa: BLE001
        logger.warning("stt_groq_failed", error=str(exc))
        return None


def _confidence_from_groq(resp: object) -> float:
    import math

    segments = getattr(resp, "segments", None)
    if not segments:
        return 0.8
    logprobs = []
    for seg in segments:
        # segments may be dicts or objects depending on SDK version.
        lp = seg.get("avg_logprob") if isinstance(seg, dict) else getattr(seg, "avg_logprob", None)
        if lp is not None:
            logprobs.append(float(lp))
    if not logprobs:
        return 0.8
    avg = sum(logprobs) / len(logprobs)
    # avg_logprob is <= 0; exp maps it to (0, 1]. Clamp to a sane floor.
    return max(0.1, min(1.0, math.exp(avg)))


async def _transcribe_deepgram(audio_bytes: bytes, language: str) -> tuple[str, float] | None:
    """Optional Deepgram Nova-2 fallback. Returns (text, confidence) or None."""
    settings = get_settings()
    if not settings.DEEPGRAM_API_KEY:
        return None
    try:
        params = {"model": settings.DEEPGRAM_MODEL, "language": language, "smart_format": "true"}
        async with httpx.AsyncClient(timeout=_DEEPGRAM_TIMEOUT) as client:
            resp = await client.post(
                _DEEPGRAM_URL,
                params=params,
                content=audio_bytes,
                headers={
                    "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
                    "Content-Type": "audio/webm",
                },
            )
        resp.raise_for_status()
        data = resp.json()
        alt = (
            data.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
        )
        text = (alt.get("transcript") or "").strip()
        confidence = float(alt.get("confidence") or 0.0)
        return text, confidence
    except Exception as exc:  # noqa: BLE001
        logger.warning("stt_deepgram_failed", error=str(exc))
        return None


async def transcribe_audio(
    audio_bytes: bytes,
    *,
    language_hint: str = "en-IN",
    resume_context: str | None = None,
    audio_id: str | None = None,
) -> dict:
    """Transcribe an audio chunk/blob. Groq Whisper primary, Deepgram fallback.

    ``resume_context`` is accepted for interface parity with the spec; the
    expensive resume-grounded repair happens later in scoring, so here it only
    gates the light cleanup. Never raises — returns empty transcript + 0
    confidence + provider="none" if all engines fail, so the caller can show a
    graceful "could not process audio" message.
    """
    audio_id = audio_id or str(uuid.uuid4())
    language = _normalize_language(language_hint)

    result = await _transcribe_groq(audio_bytes, language)
    provider = "groq"
    if result is None:
        result = await _transcribe_deepgram(audio_bytes, language)
        provider = "deepgram"

    if result is None:
        return {
            "transcript": "",
            "raw_transcript": "",
            "confidence": 0.0,
            "audio_id": audio_id,
            "provider": "none",
        }

    raw_text, confidence = result
    # Cheap deterministic cleanup only (filler removal, known tech-term casing).
    cleaned = normalize_transcript(raw_text) if raw_text else ""
    return {
        "transcript": cleaned,
        "raw_transcript": raw_text,
        "confidence": round(float(confidence), 3),
        "audio_id": audio_id,
        "provider": provider,
    }
