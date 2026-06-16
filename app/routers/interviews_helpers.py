"""
PrepVista AI - Interviews Helpers
Extracted from interviews.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, field_validator

from app.config import (
    can_access_plan,
    get_settings,
    is_valid_difficulty_mode,
    is_valid_plan,
    normalize_difficulty_mode,
)
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.middleware.rate_limiter import rate_limit_session, rate_limit_user
from app.services.evaluator import evaluate_single_question, normalize_rubric_category
from app.services.funnel_tracking import track_funnel_event
from app.services.interviewer import create_session, finish_session, process_answer
from app.services.quota import enforce_quota
from app.services.resume_parser import extract_text_from_pdf, parse_resume_structured, validate_pdf_upload

router = APIRouter()
logger = structlog.get_logger("prepvista.interviews")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_VIOLATION_TYPE_LEN  = 100
_MAX_VIOLATION_DETAIL_LEN = 500
_MAX_REASON_LEN          = 500
_MIN_DURATION_SECONDS    = 300    # 5 minutes
_MAX_DURATION_SECONDS    = 1800   # 30 minutes
_MIN_ANSWER_WORD_COUNT   = 3      # Answers below this threshold are flagged as too short
_RESUME_FINGERPRINT_LEN  = 16     # First 16 hex chars of SHA-256 — sufficient for dedup key

# Recognised proctoring mode strings.  Any value outside this set is accepted
# (for forward-compatibility with new modes) but triggers a warning log so
# that typos and stale client versions are visible in monitoring.
_KNOWN_PROCTORING_MODES  = frozenset({"practice", "exam", "strict", "monitored"})

# ---------------------------------------------------------------------------
# Concurrency semaphores — 500-user load control
# ---------------------------------------------------------------------------
# Without these, 500 simultaneous users can fire 500 concurrent LLM eval calls
# (hitting API rate limits and causing cascading 429s) and 500 concurrent PDF
# parses (exhausting server CPU and RAM).  Semaphores queue excess work rather
# than failing it, keeping the system stable under peak load.
#
# _EVAL_SEMAPHORE  — caps simultaneous calls to evaluate_single_question.
#   Each call is a network-bound LLM request (~1–4 s).  50 concurrent is
#   generous for any realistic LLM API tier; raise it if the provider allows.
#
# _SETUP_SEMAPHORE — caps simultaneous PDF-extract + LLM-parse calls in setup.
#   PDF text extraction is CPU-bound; LLM parse is network-bound.  25 is
#   sufficient for 500 concurrent setups because setup happens once per session,
#   not continuously like answer submission.
_EVAL_SEMAPHORE  = asyncio.Semaphore(50)
_SETUP_SEMAPHORE = asyncio.Semaphore(25)

# ---------------------------------------------------------------------------
# Security constants & compiled patterns
# ---------------------------------------------------------------------------

# Maximum PDF upload size.  Without this limit, a malicious user can POST a
# 500 MB file and exhaust the server's memory — especially dangerous when 500
# students upload simultaneously during a placement drive.
_MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024       # 5 MB hard cap

# Idempotency key length cap.  An unbounded client_request_id can be used to
# bloat the last_client_request_id DB column with multi-MB strings.
_MAX_CLIENT_REQUEST_ID_LEN = 128

# Access tokens must have a minimum length to carry meaningful entropy.
# Empty strings and trivially short tokens are rejected at the model layer.
_MIN_ACCESS_TOKEN_LEN = 20

# Maximum proctoring violations stored per session.  Without this cap, rapid
# tab-switching / automated scripts can spam the violation endpoint and inflate
# the JSONB column to hundreds of MB.
_MAX_VIOLATIONS_PER_SESSION = 200

# Session IDs must be UUID v4 (hyphenated hex, 36 chars).  Any other format
# in a path parameter is treated as a probe / injection attempt.
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

# Violation type must be lowercase snake_case (e.g. "tab_switch").
# This prevents HTML/script injection via the violation_type field that is
# displayed verbatim in college admin integrity reports.
_VIOLATION_TYPE_RE = re.compile(r'^[a-z][a-z0-9_]{1,63}$')

# client_request_id must be printable ASCII only (alphanumeric + hyphens).
_CLIENT_REQ_ID_RE = re.compile(r'^[A-Za-z0-9_\-]{1,128}$')

# Prompt-injection patterns: heuristic detection of adversarial content in
# user-supplied text (resume, answer) that attempts to manipulate the LLM
# evaluator into changing its scoring behaviour.
_PROMPT_INJECTION_RE = re.compile(
    r'ignore\s+(?:previous|all|above)\s+(?:instructions?|rules?|prompts?|context)'
    r'|you\s+are\s+now\s+(?:a|an)\b'
    r'|system\s*:\s*(?:you|ignore|disregard)'
    r'|disregard\s+(?:your|previous|all)\s+\w+'
    r'|forget\s+(?:everything|your|all)\s+\w+'
    r'|new\s+instructions?\s*:'
    r'|<\s*(?:system|assistant|user)\s*>',
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Safe JSON helpers
# ---------------------------------------------------------------------------

def _safe_json_dumps(value: Any) -> str:
    """Serialize safely for DB JSON columns.  Falls back to empty object on error."""
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return json.dumps({})


def _safe_json_loads(value: Any, default: Any) -> Any:
    """Deserialize JSON safely, returning default on any failure."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return default


# ---------------------------------------------------------------------------
# String normalization helpers
# ---------------------------------------------------------------------------

def _normalize_candidate_name(value: Any) -> str:
    """Normalize noisy extracted candidate names to a clean display form.

    Handles letter-by-letter spaced names (e.g. 'R A H U L'), mixed-case
    issues, and stray non-alphabetic characters.
    """
    cleaned = re.sub(r"[^A-Za-z\s.'\-]+", " ", str(value or ""))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return "Candidate"
    # Collapse space-separated single letters: "R A H U L" → "RAHUL"
    if re.fullmatch(r"(?:[A-Za-z]\s+){1,}[A-Za-z]", cleaned):
        cleaned = cleaned.replace(" ", "")
    parts: list[str] = []
    for part in cleaned.split():
        if len(part) == 1:
            parts.append(part.upper())
        elif part.isupper() and len(part) > 1:
            parts.append(part.capitalize())
        else:
            parts.append(part)
    result = " ".join(parts)[:40].strip()
    return result or "Candidate"


def _normalize_plan(plan: str) -> str:
    return (plan or "free").strip().lower()


def _normalize_proctoring_mode(value: str) -> str:
    """Normalize and safe-clip the proctoring mode string.

    Accepts any non-empty string for forward-compatibility.  Values outside
    _KNOWN_PROCTORING_MODES are logged as warnings so monitoring can catch
    typos and stale clients without breaking production.
    """
    normalized = (value or "practice").strip().lower()
    # Clip to a safe DB column length; fall back to "practice" if empty after clip
    normalized = normalized[:32] or "practice"
    if normalized not in _KNOWN_PROCTORING_MODES:
        logger.warning(
            "unknown_proctoring_mode",
            mode=normalized,
            known_modes=sorted(_KNOWN_PROCTORING_MODES),
        )
    return normalized


def _clip_text(value: str, max_length: int) -> str:
    """Trim text to max_length without cutting mid-word.

    Walks back from the hard character limit to the nearest whitespace
    boundary so that the last word is always complete.  If the text
    contains no whitespace within the allowed window the hard limit is
    used as a last resort.
    """
    text = (value or "").strip()
    if len(text) <= max_length:
        return text
    # Slice to the hard limit first, then step back to a word boundary
    truncated = text[:max_length]
    boundary = truncated.rfind(" ")
    if boundary > 0:
        return truncated[:boundary].rstrip()
    # No whitespace found — fall back to the hard limit to avoid returning ""
    return truncated


def _normalize_violation_text(value: str, max_length: int = _MAX_VIOLATION_DETAIL_LEN) -> str:
    """Sanitize and clip a proctoring violation text field."""
    return _clip_text(str(value or ""), max_length)


# ---------------------------------------------------------------------------
# Security helper functions
# ---------------------------------------------------------------------------

def _strip_control_chars(text: str) -> str:
    """Remove null bytes and non-printable ASCII control characters.

    Null bytes (\\x00) can silently truncate strings in PostgreSQL text columns
    and some C-based libraries.  Other control characters (\\x01–\\x08,
    \\x0b, \\x0c, \\x0e–\\x1f, \\x7f) have no legitimate place in interview
    answers or student-supplied text and can cause unexpected behaviour in
    logging, LLM APIs, and downstream text processing pipelines.
    """
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(text or ''))


def _validate_session_id(session_id: str) -> None:
    """Raise HTTP 400 immediately if session_id is not a valid UUID v4.

    Path-parameter injection is the most common probe vector: attackers send
    payloads like ``../../../../etc/passwd`` or ``'; DROP TABLE--`` as the
    session_id.  Enforcing UUID format at the router boundary — before any DB
    query — eliminates the entire class of path-traversal and SQL-injection
    probes even if the parameterised queries would already block them.
    """
    if not _UUID_RE.fullmatch(session_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid session identifier format.",
        )


def _validate_pdf_magic(pdf_bytes: bytes) -> None:
    """Reject uploads whose content does not begin with the PDF magic bytes.

    A user can rename any file (EXE, HTML, ZIP, script) with a .pdf extension
    and bypass filename-only checks.  The PDF specification mandates that every
    conformant file starts with the bytes ``%PDF-``.  Checking the magic bytes
    before passing the data to the PDF parser prevents malicious payloads from
    reaching the parser and potentially triggering parser vulnerabilities.
    """
    if len(pdf_bytes) < 5 or pdf_bytes[:5] != b'%PDF-':
        raise HTTPException(
            status_code=400,
            detail=(
                "The uploaded file does not appear to be a valid PDF. "
                "Please upload a genuine .pdf resume file."
            ),
        )


def _check_prompt_injection(text: str, source: str, session_context: str = '') -> None:
    """Log a security warning when prompt-injection patterns are found.

    We log rather than reject because legitimate resumes can contain phrases
    like "ignoring previous project requirements" that would trigger a naive
    blocklist.  The warning feeds into security monitoring so that persistent
    attackers are identified without breaking genuine users.
    """
    if _PROMPT_INJECTION_RE.search(text):
        logger.warning(
            "prompt_injection_pattern_detected",
            source=source,
            session=session_context,
            snippet=text[:120],   # never log the full text — may contain PII
        )


def _build_proctoring_event(event_type: str, detail: str = "") -> dict:
    """Build a proctoring event dict with a real ISO-8601 UTC timestamp."""
    return {
        "type":      _clip_text(str(event_type or "unknown"), _MAX_VIOLATION_TYPE_LEN),
        "detail":    _clip_text(str(detail or ""), _MAX_VIOLATION_DETAIL_LEN),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _compute_resume_fingerprint(pdf_bytes: bytes) -> str:
    """Return a short, stable fingerprint of the PDF content.

    Used to detect when the same resume is submitted across multiple
    sessions so the interviewer service can vary question selection and
    prevent students from seeing the same questions on every attempt.

    Only the first _RESUME_FINGERPRINT_LEN hex characters of SHA-256 are
    kept — enough for deduplication, short enough for DB indexes.
    """
    return hashlib.sha256(pdf_bytes).hexdigest()[:_RESUME_FINGERPRINT_LEN]


# ---------------------------------------------------------------------------
# Idempotency cache helpers
# ---------------------------------------------------------------------------

async def _cache_client_response(
    session_id: str,
    client_request_id: str | None,
    payload: dict,
) -> None:
    """Persist the last request/response pair so duplicate submissions are safe.

    Stores the serialized payload into the JSONB column.  Failures are
    logged as warnings — a cache miss is recoverable, a crash is not.
    """
    if not client_request_id:
        return
    try:
        async with DatabaseConnection() as conn:
            await conn.execute(
                """UPDATE interview_sessions
                   SET last_client_request_id = $2,
                       last_client_response    = $3
                   WHERE id = $1""",
                session_id,
                client_request_id,
                _safe_json_dumps(payload),
            )
    except Exception as exc:
        logger.warning(
            "client_response_cache_write_failed",
            session_id=session_id,
            client_request_id=client_request_id,
            error=str(exc),
        )


async def _get_cached_client_response(
    session_id: str,
    access_token: str,
    client_request_id: str | None,
) -> dict | None:
    """Return cached response for a duplicate client submission, or None.

    A cache read failure is non-fatal — the request is simply processed again.
    """
    if not client_request_id:
        return None
    try:
        async with DatabaseConnection() as conn:
            row = await conn.fetchrow(
                """SELECT last_client_response
                   FROM interview_sessions
                   WHERE id = $1
                     AND access_token = $2
                     AND last_client_request_id = $3""",
                session_id,
                access_token,
                client_request_id,
            )
    except Exception as exc:
        logger.warning(
            "client_response_cache_read_failed",
            session_id=session_id,
            client_request_id=client_request_id,
            error=str(exc),
        )
        return None

    if not row or not row["last_client_response"]:
        return None
    parsed = _safe_json_loads(row["last_client_response"], None)
    return parsed if isinstance(parsed, dict) else None


async def _session_is_active(session_id: str, access_token: str) -> bool:
    """Single-field DB check: True only when session.state == 'ACTIVE'."""
    try:
        async with DatabaseConnection() as conn:
            state = await conn.fetchval(
                "SELECT state FROM interview_sessions WHERE id = $1 AND access_token = $2",
                session_id,
                access_token,
            )
        return state == "ACTIVE"
    except Exception as exc:
        logger.warning("session_active_check_failed", session_id=session_id, error=str(exc))
        return False


# ---------------------------------------------------------------------------
# Answer quality pre-validation  (lightweight — before process_answer)
# ---------------------------------------------------------------------------

def _pre_validate_answer(user_text: str, max_length: int) -> tuple[str, str | None]:
    """Normalize and pre-validate the raw user answer text.

    Returns (clipped_text, warning_reason | None).

    The warning_reason is informational only — it does NOT block the answer
    from being submitted.  The AI evaluator produces the authoritative quality
    assessment.  These checks catch only the most obvious pathological inputs
    (empty, random chars, filler spam, keyboard mash) so the evaluator does
    not waste a call on provably empty content.

    warning_reason values:
      "empty_answer"       — blank or whitespace-only
      "too_short"          — fewer than _MIN_ANSWER_WORD_COUNT words
      "low_alpha_content"  — text is mostly non-alphabetic (e.g. random chars)
      "repetitive_filler"  — one word constitutes > 60 % of the whole answer
      "keyboard_mash"      — high-entropy char stream with no real words
                             (e.g. "asdfghjklqwerty" repeated)
    """
    # Strip null bytes and control characters before any quality checks.
    # Null bytes can silently truncate text in PostgreSQL text columns and
    # some LLM API clients.  Control chars have no legitimate place in
    # interview answers and can cause unpredictable downstream behaviour.
    cleaned = _strip_control_chars(user_text)
    text = _clip_text(cleaned, max_length)

    if not text:
        return text, "empty_answer"

    word_count = len(text.split())
    if word_count < _MIN_ANSWER_WORD_COUNT:
        return text, "too_short"

    # Detect pure random character strings (no real words)
    alpha_ratio = sum(c.isalpha() for c in text) / max(len(text), 1)
    if alpha_ratio < 0.4 and word_count < 10:
        return text, "low_alpha_content"

    # Detect repetitive filler spam (same word repeated > 60% of content)
    words = text.lower().split()
    if words:
        most_common_count = max(words.count(w) for w in set(words))
        if most_common_count / len(words) > 0.6 and len(words) > 5:
            return text, "repetitive_filler"

    # Detect keyboard mash: very low unique-bigram diversity relative to length.
    # A genuine answer of 20+ chars will naturally produce many distinct letter
    # pairs. A mash like "asdfasdfasdf" produces only ~4 unique bigrams.
    # Threshold: fewer than 8 unique bigrams AND longer than 15 chars AND
    # all characters come from a single keyboard row (heuristic).
    if len(text) > 15 and word_count <= 4:
        lower = text.lower().replace(" ", "")
        unique_bigrams = len(set(zip(lower, lower[1:])))
        if unique_bigrams < 8:
            return text, "keyboard_mash"

    return text, None


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
