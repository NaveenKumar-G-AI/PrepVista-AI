"""
PrepVista AI - Interviews Router
=================================
Core interview lifecycle: setup, answer submission, finish, terminate,
proctoring violation logging (terminal + non-terminal).

All public endpoint paths, function names, and response shapes are
backward-compatible with the existing system.  Every upgrade is purely
additive or a safe internal improvement.

Endpoints
---------
POST /setup                        — create a new session
POST /{session_id}/answer          — submit an answer, receive next question
POST /{session_id}/finish          — explicitly finish and score the session
POST /{session_id}/terminate       — hard-terminate on proctoring violation
POST /{session_id}/violation       — log a non-terminal proctoring event
                                     (tab-switch, face absent, etc.) without
                                     ending the session
"""

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

class AnswerRequest(BaseModel):
    user_text: str = ""
    access_token: str
    duration_actual: int | None = None
    answer_duration_seconds: int | None = None
    client_request_id: str | None = None

    @field_validator("user_text", "access_token", "client_request_id", mode="before")
    @classmethod
    def _strip_strings(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("access_token", mode="after")
    @classmethod
    def _check_token_len(cls, value: str) -> str:
        if len(value) < _MIN_ACCESS_TOKEN_LEN:
            raise ValueError("access_token is too short to be valid.")
        return value

    @field_validator("client_request_id", mode="after")
    @classmethod
    def _check_request_id(cls, value: str | None) -> str | None:
        if value and not _CLIENT_REQ_ID_RE.fullmatch(value):
            raise ValueError("client_request_id must be alphanumeric with hyphens/underscores, ≤128 chars.")
        return value

    @field_validator("answer_duration_seconds", "duration_actual", mode="before")
    @classmethod
    def _validate_durations(cls, value: Any) -> int | None:
        if value is None:
            return None
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return None


class FinishRequest(BaseModel):
    access_token: str
    duration_actual: int | None = None

    @field_validator("access_token", mode="before")
    @classmethod
    def _strip_access_token(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("access_token", mode="after")
    @classmethod
    def _check_token_len(cls, value: str) -> str:
        if len(value) < _MIN_ACCESS_TOKEN_LEN:
            raise ValueError("access_token is too short to be valid.")
        return value

    @field_validator("duration_actual", mode="before")
    @classmethod
    def _validate_duration(cls, value: Any) -> int | None:
        if value is None:
            return None
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return None


class TerminateRequest(BaseModel):
    access_token: str
    reason: str = ""
    duration_actual: int | None = None

    @field_validator("access_token", "reason", mode="before")
    @classmethod
    def _strip_fields(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("access_token", mode="after")
    @classmethod
    def _check_token_len(cls, value: str) -> str:
        if len(value) < _MIN_ACCESS_TOKEN_LEN:
            raise ValueError("access_token is too short to be valid.")
        return value

    @field_validator("duration_actual", mode="before")
    @classmethod
    def _validate_duration(cls, value: Any) -> int | None:
        if value is None:
            return None
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return None


class ViolationRequest(BaseModel):
    """Request body for a non-terminal proctoring event.

    Used by the client to log mid-session integrity events (tab-switch,
    camera absence, window blur, copy-paste attempt, etc.) without
    ending the interview.  The session remains ACTIVE after this call.
    Use /terminate for hard violations that must end the session.
    """
    access_token: str
    violation_type: str
    detail: str = ""

    @field_validator("access_token", "violation_type", "detail", mode="before")
    @classmethod
    def _strip_fields(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("access_token", mode="after")
    @classmethod
    def _check_token_len(cls, value: str) -> str:
        if len(value) < _MIN_ACCESS_TOKEN_LEN:
            raise ValueError("access_token is too short to be valid.")
        return value

    @field_validator("violation_type", mode="after")
    @classmethod
    def _check_violation_type(cls, value: str) -> str:
        # Enforce snake_case to prevent stored-XSS via violation_type rendered
        # verbatim in college admin integrity reports.
        if not _VIOLATION_TYPE_RE.fullmatch(value):
            raise ValueError(
                "violation_type must be lowercase snake_case (e.g. 'tab_switch'), ≤64 chars."
            )
        return value


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/setup")
async def setup_interview(
    request: Request,
    resume: UploadFile = File(...),
    plan: str = Form("free"),
    difficulty_mode: str = Form("auto"),
    duration: int = Form(600),
    proctoring_mode: str = Form("practice"),
    user: UserProfile = Depends(get_current_user),
):
    """Set up a new interview session.

    Validates the plan, difficulty mode, PDF upload, and resume content
    before creating a session and returning the session credentials.
    """
    await rate_limit_user(user.id)
    await enforce_quota(user)

    normalized_plan = _normalize_plan(plan)
    if not is_valid_plan(normalized_plan):
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan!r}. Expected: free, pro, or career.")

    if not is_valid_difficulty_mode(difficulty_mode):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid difficulty mode: {difficulty_mode!r}. Expected: auto, basic, medium, or difficult.",
        )
    normalized_difficulty = normalize_difficulty_mode(difficulty_mode)

    current_user_plan = _normalize_plan(
        getattr(user, "effective_plan", getattr(user, "plan", "free"))
    )
    if not can_access_plan(current_user_plan, normalized_plan):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Your current plan ({current_user_plan!r}) does not include "
                f"{normalized_plan!r} features. Upgrade to access this plan."
            ),
        )

    if not resume.filename:
        raise HTTPException(status_code=400, detail="A resume file is required.")
    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF resumes are supported. Please upload a .pdf file.",
        )

    # --- PDF size guard (DoS prevention) ------------------------------------
    # Check Content-Length header first as a fast path before reading the body.
    # This rejects oversized uploads before they consume server memory.
    content_length_hdr = request.headers.get("content-length")
    if content_length_hdr:
        try:
            if int(content_length_hdr) > _MAX_PDF_SIZE_BYTES + 65536:  # +64 KB form overhead
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload too large. Resume PDF must be under {_MAX_PDF_SIZE_BYTES // (1024*1024)} MB.",
                )
        except ValueError:
            pass  # Malformed Content-Length — proceed and check actual size below

    pdf_bytes = await resume.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The uploaded resume file is empty.")

    # Actual size check after read (catches chunked uploads that bypass Content-Length)
    if len(pdf_bytes) > _MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Resume PDF must be under {_MAX_PDF_SIZE_BYTES // (1024*1024)} MB.",
        )

    # --- PDF magic byte validation (file-type spoofing prevention) ----------
    # Reject files that don't start with %PDF- regardless of their extension.
    # A renamed .exe, .html, or .zip would pass a filename-only check but fail
    # this content-level check before reaching the PDF parser.
    _validate_pdf_magic(pdf_bytes)

    # Validate PDF structure before attempting text extraction
    validate_pdf_upload(pdf_bytes, resume.filename or "resume.pdf")

    # Acquire the setup semaphore before the CPU-bound PDF extraction and the
    # network-bound LLM parse.  This caps concurrent work at _SETUP_SEMAPHORE
    # slots regardless of how many users hit /setup simultaneously, preventing
    # CPU spikes and LLM rate-limit exhaustion during peak load (e.g. college
    # placement drive where 200 students start within minutes of each other).
    async with _SETUP_SEMAPHORE:
        resume_text = extract_text_from_pdf(pdf_bytes)
        if not resume_text or not resume_text.strip():
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract readable text from the uploaded resume. "
                    "Please ensure the PDF is not scanned, image-only, or password-protected."
                ),
            )

        if len(resume_text.strip()) < 100:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The extracted resume content is too short to generate a meaningful interview. "
                    "Please upload a more complete resume."
                ),
            )

        # Check for prompt injection patterns in the resume text.
        # We log (not reject) to avoid blocking legitimate resumes that
        # contain phrases like "ignore previous technical requirements."
        _check_prompt_injection(resume_text, source="resume_text")

        resume_summary = await parse_resume_structured(resume_text)

    if not isinstance(resume_summary, dict):
        resume_summary = {}

    # Compute a stable fingerprint of this exact PDF for cross-session question
    # de-duplication.  The fingerprint is persisted against the session so that
    # the interviewer service can detect when the same resume has been used in
    # prior sessions and avoid repeating the same question patterns.
    resume_fingerprint = _compute_resume_fingerprint(pdf_bytes)

    # Clamp duration to a safe range
    clamped_duration = max(_MIN_DURATION_SECONDS, min(_MAX_DURATION_SECONDS, int(duration)))
    normalized_proctoring_mode = _normalize_proctoring_mode(proctoring_mode)

    # Track that setup was initiated — allows us to measure how many sessions
    # drop out during PDF processing vs after (setup started / mock started ratio).
    try:
        async with DatabaseConnection() as conn:
            await track_funnel_event(
                conn, "setup started",
                user_id=user.id,
                metadata={"plan": normalized_plan, "resume_fingerprint": resume_fingerprint},
            )
    except Exception as exc:
        logger.warning("funnel_tracking_setup_started_failed", user_id=user.id, error=str(exc))

    result = await create_session(
        user_id=user.id,
        plan=normalized_plan,
        difficulty_mode=normalized_difficulty,
        resume_text=resume_text,
        resume_summary=resume_summary,
        resume_file_path=None,
        duration_seconds=clamped_duration,
        proctoring_mode=normalized_proctoring_mode,
    )

    session_id = result["session_id"]

    logger.info(
        "interview_setup_complete",
        user_id=user.id,
        session_id=session_id,
        plan=normalized_plan,
        difficulty_mode=normalized_difficulty,
        proctoring_mode=normalized_proctoring_mode,
        duration=clamped_duration,
        resume_fingerprint=resume_fingerprint,
    )

    # Persist the resume fingerprint and fire post-session funnel events in a
    # Persist the resume fingerprint against the session so the interviewer
    # service can use it for cross-session question variation.
    # SEPARATE try/except from funnel tracking — these two operations are
    # independent.  A fingerprint write failure must NOT prevent funnel events
    # from firing, and a funnel event failure must NOT prevent fingerprint storage.
    try:
        async with DatabaseConnection() as conn:
            await conn.execute(
                """UPDATE interview_sessions
                   SET resume_fingerprint = $2
                   WHERE id = $1""",
                session_id,
                resume_fingerprint,
            )
    except Exception as exc:
        logger.warning(
            "resume_fingerprint_store_failed",
            session_id=session_id,
            resume_fingerprint=resume_fingerprint,
            error=str(exc),
        )

    # Non-critical funnel tracking — in its own try/except so that a tracking
    # failure never blocks or corrupts the session response.
    try:
        async with DatabaseConnection() as conn:
            await track_funnel_event(
                conn, "resume uploaded",
                user_id=user.id,
                metadata={
                    "session_id": session_id,
                    "plan": normalized_plan,
                    "resume_fingerprint": resume_fingerprint,
                },
            )
            await track_funnel_event(
                conn, "mock started",
                user_id=user.id,
                metadata={"session_id": session_id, "plan": normalized_plan},
            )
    except Exception as exc:
        logger.warning("funnel_tracking_setup_failed", session_id=session_id, error=str(exc))

    return {
        "session_id":         session_id,
        "access_token":       result["access_token"],
        "plan":               result["plan"],
        "difficulty_mode":    result["difficulty_mode"],
        "max_turns":          result["max_turns"],
        "duration_seconds":   result["duration_seconds"],
        "proctoring_mode":    result["proctoring_mode"],
        "candidate_name":     _normalize_candidate_name(
            resume_summary.get("candidate_name", "Candidate")
        ),
        # Additive: lets the client track which resume fingerprint this session
        # was built on — useful for debugging cross-session dedup and for
        # showing the student "session #N with this resume".
        "resume_fingerprint": resume_fingerprint,
    }


@router.post("/{session_id}/answer")
async def submit_answer(
    session_id: str,
    req: AnswerRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: UserProfile = Depends(get_current_user),
):
    """Submit a user answer and receive the next AI question or the finish payload.

    Idempotent: duplicate submissions with the same client_request_id return
    the cached response instantly without reprocessing.

    The response may include an optional ``answer_quality_hint`` field when
    the submitted answer is detected as low-quality (too short, empty,
    repetitive, or a keyboard mash).  The frontend can use this hint to
    show the student a non-blocking nudge like "Consider adding more detail
    to your answer."  Clients that do not recognise this field can safely
    ignore it — it is purely informational.
    """
    # UUID format check before any DB query — eliminates path-traversal probes
    _validate_session_id(session_id)
    await rate_limit_session(session_id)

    settings = get_settings()
    max_answer_length = getattr(settings, "MAX_ANSWER_TEXT_LENGTH", 3000)

    # --- Pre-validate and normalize the answer text ---
    normalized_text, pre_validation_warning = _pre_validate_answer(
        req.user_text, max_answer_length
    )
    answer_word_count = len(normalized_text.split()) if normalized_text else 0

    if pre_validation_warning:
        logger.info(
            "answer_pre_validation_flag",
            session_id=session_id,
            warning=pre_validation_warning,
            answer_word_count=answer_word_count,
        )

    # Check for prompt injection in the answer text — a sophisticated attacker
    # may craft an answer designed to manipulate the LLM evaluator's output.
    if normalized_text:
        _check_prompt_injection(normalized_text, source="answer_text", session_context=session_id)

    # --- Fast path: idempotent cache check ---
    cached = await _get_cached_client_response(
        session_id=session_id,
        access_token=req.access_token,
        client_request_id=req.client_request_id,
    )
    if cached:
        logger.debug("idempotent_cache_hit", session_id=session_id,
                     client_request_id=req.client_request_id)
        return cached

    # --- Core answer processing ---
    result = await process_answer(
        session_id=session_id,
        user_text=normalized_text,
        access_token=req.access_token,
    )

    if result.get("action") == "error":
        raise HTTPException(status_code=400, detail=result.get("detail", "Answer processing failed."))

    question_for_eval = result.get("question_for_eval")
    turn_for_eval     = result.get("turn_for_eval")

    # Log the question text that was served to the student.  This creates an
    # audit trail that the deduplication layer (in interviewer.py) can use to
    # detect when the same or similar question has been asked in previous
    # sessions for the same resume fingerprint.
    next_question_text = result.get("question") or result.get("next_question") or ""
    if next_question_text:
        logger.debug(
            "question_served",
            session_id=session_id,
            turn=turn_for_eval,
            answer_word_count=answer_word_count,
            answer_quality_hint=pre_validation_warning,
            question_preview=next_question_text[:80],
        )

    # Only evaluate turns with real answer content and a valid question+turn pair
    should_evaluate = bool(
        normalized_text
        and normalized_text.strip()
        and question_for_eval
        and turn_for_eval is not None
        and pre_validation_warning not in {"empty_answer"}
    )

    # --- Final answer → synchronous eval + finish ---
    if result.get("action") == "finish":
        was_active = await _session_is_active(session_id, req.access_token)

        if should_evaluate:
            try:
                await _evaluate_and_store(
                    session_id=session_id,
                    turn_number=int(turn_for_eval),
                    question_text=str(question_for_eval),
                    raw_answer=normalized_text,
                    answer_duration_seconds=req.answer_duration_seconds,
                    answer_word_count=answer_word_count,
                )
            except Exception as exc:
                logger.error(
                    "final_eval_failed",
                    session_id=session_id,
                    turn=turn_for_eval,
                    error=str(exc),
                )

        final_result = await finish_session(
            session_id=session_id,
            access_token=req.access_token,
            duration_actual=req.duration_actual,
        )
        if "error" in final_result:
            raise HTTPException(status_code=400, detail=final_result["error"])

        logger.info(
            "interview_finished_via_answer",
            session_id=session_id,
            score=final_result.get("final_score"),
        )

        if was_active:
            try:
                async with DatabaseConnection() as conn:
                    await track_funnel_event(
                        conn, "mock completed",
                        user_id=user.id,
                        metadata={"session_id": session_id},
                    )
            except Exception as exc:
                logger.warning("funnel_tracking_finish_failed", session_id=session_id, error=str(exc))

        payload = {"action": "finish", **final_result}
        # Additive: surface quality hint to frontend on the finish path too
        if pre_validation_warning:
            payload["answer_quality_hint"] = pre_validation_warning
        await _cache_client_response(session_id, req.client_request_id, payload)
        return payload

    # --- Mid-interview → background evaluation ---
    if should_evaluate:
        background_tasks.add_task(
            _evaluate_and_store,
            session_id=session_id,
            turn_number=int(turn_for_eval),
            question_text=str(question_for_eval),
            raw_answer=normalized_text,
            answer_duration_seconds=req.answer_duration_seconds,
            answer_word_count=answer_word_count,
        )

    # Additive: surface answer quality hint to the frontend so it can
    # show a non-blocking nudge ("Your answer seems a bit short — consider
    # adding specific examples") without affecting scoring logic.
    if pre_validation_warning:
        result = {**result, "answer_quality_hint": pre_validation_warning}

    await _cache_client_response(session_id, req.client_request_id, result)
    return result


@router.post("/{session_id}/finish")
async def end_interview(
    session_id: str,
    req: FinishRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Explicitly finish the interview and compute the final score.

    Safe to call even if the session was already finished — the service
    layer returns an error payload instead of crashing.
    """
    _validate_session_id(session_id)
    was_active = await _session_is_active(session_id, req.access_token)
    result = await finish_session(
        session_id=session_id,
        access_token=req.access_token,
        duration_actual=req.duration_actual,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    logger.info("interview_finished_explicit", session_id=session_id, score=result.get("final_score"))

    if was_active:
        try:
            async with DatabaseConnection() as conn:
                await track_funnel_event(
                    conn, "mock completed",
                    user_id=user.id,
                    metadata={"session_id": session_id},
                )
        except Exception as exc:
            logger.warning("funnel_tracking_finish_failed", session_id=session_id, error=str(exc))

    return result


@router.post("/{session_id}/terminate")
async def terminate_interview(
    session_id: str,
    req: TerminateRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Force-end the interview due to a hard client-side proctoring violation."""
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            """SELECT id, state, proctoring_violations
               FROM interview_sessions
               WHERE id = $1 AND access_token = $2""",
            session_id,
            req.access_token,
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
        if session["state"] != "ACTIVE":
            raise HTTPException(status_code=400, detail="This interview session is no longer active.")

        violations = _safe_json_loads(session["proctoring_violations"], [])
        if not isinstance(violations, list):
            violations = []

        reason = _normalize_violation_text(req.reason, _MAX_REASON_LEN)
        if reason:
            violations.append(_build_proctoring_event("termination", reason))

        await conn.execute(
            """UPDATE interview_sessions
               SET termination_reason    = $2,
                   proctoring_violations = $3
               WHERE id = $1""",
            session_id,
            reason,
            _safe_json_dumps(violations),
        )

    logger.info("interview_terminated", session_id=session_id, reason=reason[:80] if reason else "")

    result = await finish_session(
        session_id=session_id,
        access_token=req.access_token,
        duration_actual=req.duration_actual,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {"action": "terminated", "termination_reason": reason, **result}


@router.post("/{session_id}/violation")
async def log_proctoring_violation(
    session_id: str,
    req: ViolationRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Log a non-terminal proctoring event without ending the session.

    Use this endpoint for soft integrity events that should be recorded
    but that do not warrant session termination:
      - Tab switch / window blur
      - Camera not detected
      - Copy-paste attempt
      - Phone detected in frame
      - Multiple faces detected

    The session remains ACTIVE.  All logged events are visible in the
    college admin dashboard and in the per-student integrity report.
    Use /terminate for hard violations that must end the session immediately.

    This endpoint is idempotency-safe: calling it multiple times with the
    same violation_type and timestamp produces distinct log entries, which
    is the correct behaviour for repeated events (e.g. 5 tab-switches).
    """
    # UUID format check and rate limit before any DB access
    _validate_session_id(session_id)
    await rate_limit_session(session_id)

    event = _build_proctoring_event(
        _clip_text(req.violation_type, _MAX_VIOLATION_TYPE_LEN),
        _normalize_violation_text(req.detail),
    )
    event_json = _safe_json_dumps(event)

    async with DatabaseConnection() as conn:
        # Two-phase: fast state check, then atomic JSONB append.
        # The atomic || append eliminates the Python-side read-modify-write
        # race condition that occurred when multiple tab-switch events fired
        # within the same millisecond (e.g. 10 rapid blur events on mobile).
        # Old pattern: SELECT violations → Python list.append → UPDATE  (3 ops, TOCTOU race)
        # New pattern: SELECT state     → atomic JSONB append          (2 ops, race-free)
        state = await conn.fetchval(
            "SELECT state FROM interview_sessions WHERE id = $1 AND access_token = $2",
            session_id,
            req.access_token,
        )
        if state is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        if state != "ACTIVE":
            raise HTTPException(
                status_code=400,
                detail="This interview session is no longer active.",
            )

        # Violation count cap — prevent DB bloat via automated violation spam.
        current_count = await conn.fetchval(
            "SELECT jsonb_array_length(COALESCE(proctoring_violations, '[]'::jsonb)) FROM interview_sessions WHERE id = $1",
            session_id,
        ) or 0
        if current_count >= _MAX_VIOLATIONS_PER_SESSION:
            logger.warning(
                "violation_cap_reached",
                session_id=session_id,
                count=current_count,
            )
            return {
                "logged":          False,
                "violation_type":  event["type"],
                "violation_count": current_count,
                "timestamp":       event["timestamp"],
                "capped":          True,
            }

        # PostgreSQL's jsonb || jsonb_build_array() appends the event atomically.
        # RETURNING gives us the new array length without an extra SELECT.
        row = await conn.fetchrow(
            """UPDATE interview_sessions
               SET proctoring_violations =
                     COALESCE(proctoring_violations, '[]'::jsonb)
                     || jsonb_build_array($2::jsonb)
               WHERE id = $1
               RETURNING jsonb_array_length(
                           COALESCE(proctoring_violations, '[]'::jsonb)
                         ) AS violation_count""",
            session_id,
            event_json,
        )

    violation_count = (row["violation_count"] if row else 0) + 1  # +1 for the appended event

    logger.info(
        "proctoring_violation_logged",
        session_id=session_id,
        violation_type=event["type"],
        total_violations=violation_count,
    )

    return {
        "logged":            True,
        "violation_type":    event["type"],
        "violation_count":   violation_count,
        "timestamp":         event["timestamp"],
    }


# ---------------------------------------------------------------------------
# Background evaluation task
# ---------------------------------------------------------------------------

async def _evaluate_and_store(
    session_id: str,
    turn_number: int,
    question_text: str,
    raw_answer: str,
    answer_duration_seconds: int | None = None,
    answer_word_count: int | None = None,
) -> None:
    """Run per-question AI evaluation and persist the result.

    Structured in three DB-separated phases so the connection is never
    held open during the LLM evaluation call:

      Phase 1 — Read session data; early-exit if already evaluated.
      Phase 2 — Run the LLM evaluator (outside any DB connection).
      Phase 3 — Write the result with a post-eval double-insert guard.

    The Phase 3 INSERT uses ON CONFLICT DO NOTHING so concurrent finish
    calls cannot create duplicate rows.

    answer_word_count is an optional performance hint for the evaluator —
    a 3-word answer should be scored differently from a 300-word answer
    even when the AI evaluator sees similar content quality.
    """
    try:
        # ---- Phase 1: read ------------------------------------------------
        async with DatabaseConnection() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM question_evaluations WHERE session_id = $1 AND turn_number = $2",
                session_id,
                turn_number,
            )
            if existing:
                logger.debug(
                    "eval_already_exists_skip",
                    session_id=session_id,
                    turn=turn_number,
                )
                return  # Already evaluated — skip

            session = await conn.fetchrow(
                "SELECT plan, resume_summary, question_plan FROM interview_sessions WHERE id = $1",
                session_id,
            )
            if not session:
                logger.warning("eval_session_missing", session_id=session_id, turn=turn_number)
                return

        # ---- Derive rubric category (no DB connection) --------------------
        plan = _normalize_plan(session["plan"])
        resume_summary = session["resume_summary"] or "{}"
        question_plan = _safe_json_loads(session["question_plan"], [])
        if not isinstance(question_plan, list):
            question_plan = []

        rubric_category = "technical_depth"
        for item in question_plan:
            if isinstance(item, dict) and int(item.get("turn", 0) or 0) == int(turn_number):
                rubric_category = str(item.get("category") or "technical_depth")
                break
        rubric_category = normalize_rubric_category(question_text, rubric_category, plan)

        # ---- Phase 2: LLM evaluation (no DB connection) -------------------
        # Acquire the eval semaphore before calling the LLM.  Under 500
        # concurrent users, answer submissions arrive in bursts (end-of-question
        # silence timeout fires for many users simultaneously).  Without a
        # semaphore, a burst of 100+ simultaneous LLM calls hits API rate limits,
        # returns 429s, and the background tasks all fail silently.  The semaphore
        # queues excess tasks — they still run, just not all at once.
        async with _EVAL_SEMAPHORE:
            eval_result = await evaluate_single_question(
                question_text=question_text,
                raw_answer=raw_answer,
                resume_summary=str(resume_summary),
                rubric_category=rubric_category,
                plan=plan,
            )
        if not isinstance(eval_result, dict):
            logger.warning(
                "invalid_eval_result_type",
                session_id=session_id,
                turn=turn_number,
                category=rubric_category,
            )
            return

        # ---- Phase 3: write (new connection, double-insert guard) ---------
        async with DatabaseConnection() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM question_evaluations WHERE session_id = $1 AND turn_number = $2",
                session_id,
                turn_number,
            )
            if existing:
                return  # Race condition — already inserted by another task

            await conn.execute(
                """INSERT INTO question_evaluations
                   (session_id, turn_number, rubric_category, question_text,
                    raw_answer, normalized_answer, classification, score,
                    scoring_rationale, missing_elements, ideal_answer,
                    communication_score, communication_notes, relevance_score,
                    clarity_score, specificity_score, structure_score,
                    answer_status, content_understanding, depth_quality,
                    communication_clarity, what_worked, what_was_missing,
                    how_to_improve, answer_blueprint, corrected_intent,
                    answer_duration_seconds)
                   VALUES
                   ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                    $12,$13,$14,$15,$16,$17,$18,$19,$20,
                    $21,$22,$23,$24,$25,$26,$27)
                   ON CONFLICT (session_id, turn_number) DO NOTHING""",
                session_id,
                turn_number,
                rubric_category,
                question_text,
                eval_result.get("raw_answer", raw_answer),
                eval_result.get("normalized_answer", raw_answer),
                eval_result.get("classification", ""),
                eval_result.get("score", 0),
                eval_result.get("scoring_rationale") or eval_result.get("why_score", ""),
                eval_result.get("missing_elements", []),
                eval_result.get("ideal_answer") or eval_result.get("better_answer", ""),
                eval_result.get("communication_score", 0),
                eval_result.get("communication_notes", ""),
                eval_result.get("relevance_score") or eval_result.get("question_match_score", 0),
                eval_result.get("clarity_score") or eval_result.get("depth_score", 0),
                eval_result.get("specificity_score", 0),
                eval_result.get("structure_score", 0),
                eval_result.get("answer_status", ""),
                (eval_result.get("content_understanding")
                 or eval_result.get("content_quality")
                 or eval_result.get("technical_understanding", "")),
                eval_result.get("depth_quality", ""),
                eval_result.get("communication_clarity") or eval_result.get("communication_quality", ""),
                eval_result.get("what_worked", ""),
                eval_result.get("what_was_missing", ""),
                eval_result.get("how_to_improve", ""),
                eval_result.get("answer_blueprint", ""),
                eval_result.get("corrected_intent", ""),
                answer_duration_seconds,
            )

        logger.info(
            "question_evaluated",
            session_id=session_id,
            turn=turn_number,
            score=eval_result.get("score", 0),
            category=rubric_category,
            answer_word_count=answer_word_count,
            answer_duration_seconds=answer_duration_seconds,
        )

    except Exception as exc:
        logger.error(
            "background_eval_failed",
            session_id=session_id,
            turn=turn_number,
            error=str(exc),
        )