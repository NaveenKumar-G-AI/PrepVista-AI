"""
PrepVista AI — Global Error Handler
Structured error responses for all exception types with request correlation.

Recommendations applied:
  [Rec A] PII scrubbing — emails, phones, tokens, JWTs redacted before logging
  [Rec B] Error metrics counters — get_error_metrics() for Prometheus/StatsD
  [Rec C] Optional Sentry integration — auto-detected at import time
  [Rec D] Async-offloaded traceback formatting — run_in_executor keeps event loop free
  [Rec E] Error deduplication LRU — identical (exc_type, path) suppressed for 60s
  [+]     exc.headers forwarding — Retry-After / X-RateLimit-* forwarded on 429
"""

import asyncio
import re
import time
import traceback
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database.connection import DatabaseNotReadyError

# ── Optional Sentry integration (Rec C) ──────────────────────────────────────
# No new hard dependency — silently skipped if sentry_sdk is not installed.
# To activate: pip install sentry-sdk and call sentry_sdk.init(dsn=...) in main.py
try:
    import sentry_sdk
    _SENTRY_AVAILABLE = True
except ImportError:
    _SENTRY_AVAILABLE = False

logger = structlog.get_logger("prepvista.errors")

# ── Constants ─────────────────────────────────────────────────────────────────
_MAX_TRACEBACK_CHARS = 4000
_MSG_DB_UNAVAILABLE = (
    "The service is temporarily unavailable due to a database issue. "
    "Please try again in a few moments."
)
_MSG_SERVER_ERROR = "An unexpected error occurred. Please try again."

# ── Error deduplication (Rec E) ───────────────────────────────────────────────
# Suppresses repeated identical log entries for same (exc_type, path) within
# 60 seconds. Prevents log-sink flooding when a broken endpoint is hammered
# by 500 concurrent users simultaneously.
_ERROR_DEDUP_WINDOW_SECONDS = 60
_ERROR_DEDUP_MAX_KEYS = 256
_error_last_logged: dict[tuple, float] = {}

# ── Error metrics counters (Rec B) ────────────────────────────────────────────
# Incremented on every handler invocation.
# Exposed via get_error_metrics() for Prometheus / StatsD / Datadog wiring.
_error_counters: dict[str, int] = defaultdict(int)

# ── PII scrubbing patterns (Rec A) ────────────────────────────────────────────
# Applied to traceback strings and error messages BEFORE writing to any log sink.
# Prevents student PII, auth tokens, and DB credentials from reaching Datadog,
# CloudWatch, Sentry, or any other observability platform.
_PII_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Email addresses
    (re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'), '[EMAIL]'),
    # Indian mobile numbers (+91 prefix optional)
    (re.compile(r'\b(?:\+91[\-\s]?)?[6-9]\d{9}\b'), '[PHONE_IN]'),
    # Key=value credential patterns (password, token, secret, api_key, etc.)
    (
        re.compile(
            r'(?i)(password|passwd|token|secret|authorization|api[_\-]?key)\s*[=:]\s*\S+'
        ),
        r'\1=[REDACTED]',
    ),
    # Bearer tokens in Authorization headers
    (re.compile(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*'), 'Bearer [REDACTED]'),
    # JSON Web Tokens (three base64url segments)
    (re.compile(r'eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*'), '[JWT]'),
    # Postgres / Supabase connection strings
    (re.compile(r'postgresql://[^\s\'"]+'), 'postgresql://[REDACTED]'),
    # Generic long hex secrets in query strings
    (re.compile(r'(?i)(key|secret|pass|auth)[=:][a-f0-9\-]{20,}'), r'\1=[REDACTED]'),
]


def _scrub_pii(text: str) -> str:
    """Apply all PII scrubbing patterns to a string before it reaches any log sink."""
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _should_log_error(exc_type: str, path: str) -> bool:
    """
    Deduplication gate (Rec E).
    Returns True if this (exc_type, path) pair should produce a log entry now.
    Suppresses identical errors within _ERROR_DEDUP_WINDOW_SECONDS.
    """
    key = (exc_type, path)
    now = time.monotonic()

    if key in _error_last_logged:
        if now - _error_last_logged[key] < _ERROR_DEDUP_WINDOW_SECONDS:
            return False

    # Evict oldest entry when the dedup dict is at capacity.
    if len(_error_last_logged) >= _ERROR_DEDUP_MAX_KEYS:
        oldest = min(_error_last_logged, key=lambda k: _error_last_logged[k])
        del _error_last_logged[oldest]

    _error_last_logged[key] = now
    return True


def get_error_metrics() -> dict[str, int]:
    """
    Return current error counts keyed by error_type.

    Prometheus example:
        for error_type, count in get_error_metrics().items():
            error_total.labels(type=error_type).inc(count)

    StatsD / Datadog example:
        for error_type, count in get_error_metrics().items():
            statsd.gauge(f"prepvista.errors.{error_type}", count)
    """
    return dict(_error_counters)


# ── Response helpers ──────────────────────────────────────────────────────────

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_request_path(request: Request) -> str:
    try:
        return str(request.url)
    except Exception:
        return "<unparseable-url>"


def _build_response(
    status_code: int,
    detail: object,
    request_id: str,
    error_type: str,
) -> dict:
    """
    Standard PrepVista error envelope.
    Original fields (error, status_code, detail, request_id) are unchanged.
    error_type and timestamp are additive — ignored by consumers not expecting them.
    """
    return {
        "error": True,
        "status_code": status_code,
        "detail": detail,
        "request_id": request_id,
        "error_type": error_type,
        "timestamp": _utc_now_iso(),
    }


def _json_response_with_id(
    status_code: int,
    body: dict,
    request_id: str,
    extra_headers: Optional[dict] = None,
) -> JSONResponse:
    """
    Build JSONResponse with X-Request-ID header.
    extra_headers forwards Retry-After, X-RateLimit-* etc. from HTTPException.headers
    so the rate limiter's signals reach the client instead of being silently dropped.
    """
    response = JSONResponse(status_code=status_code, content=body)
    response.headers["X-Request-ID"] = request_id
    if extra_headers:
        for name, value in extra_headers.items():
            response.headers[name] = str(value)
    return response


# ── Handler registration ──────────────────────────────────────────────────────

def register_error_handlers(app: FastAPI):
    """Register global exception handlers on the FastAPI app."""

    # ------------------------------------------------------------------ #
    # 1. Database not ready — 503                                          #
    # ------------------------------------------------------------------ #
    @app.exception_handler(DatabaseNotReadyError)
    async def database_not_ready_handler(request: Request, exc: DatabaseNotReadyError):
        request_id = uuid.uuid4().hex
        _error_counters["database_unavailable"] += 1
        body = _build_response(503, _MSG_DB_UNAVAILABLE, request_id, "database_unavailable")
        try:
            logger.warning(
                "database_not_ready",
                request_id=request_id,
                path=_safe_request_path(request),
                method=request.method,
                # SECURITY: internal error detail logged server-side only; never sent to client.
                internal_error=_scrub_pii(str(exc)),
            )
        except Exception:
            pass
        return _json_response_with_id(503, body, request_id)

    # ------------------------------------------------------------------ #
    # 2. Pydantic / FastAPI request validation — 422                       #
    # ------------------------------------------------------------------ #
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = uuid.uuid4().hex
        _error_counters["validation_error"] += 1
        errors = exc.errors()
        body = _build_response(422, errors, request_id, "validation_error")
        try:
            logger.warning(
                "request_validation_error",
                request_id=request_id,
                path=_safe_request_path(request),
                method=request.method,
                errors=errors,
            )
        except Exception:
            pass
        return _json_response_with_id(422, body, request_id)

    # ------------------------------------------------------------------ #
    # 3. FastAPI HTTPException — 4xx / 5xx raised by route handlers        #
    # ------------------------------------------------------------------ #
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = uuid.uuid4().hex
        _error_counters["http_error"] += 1
        safe_detail = (
            exc.detail
            if isinstance(exc.detail, (str, list, dict, int, float, bool, type(None)))
            else str(exc.detail)
        )
        body = _build_response(exc.status_code, safe_detail, request_id, "http_error")
        try:
            logger.warning(
                "http_exception",
                request_id=request_id,
                path=_safe_request_path(request),
                method=request.method,
                status_code=exc.status_code,
                detail=safe_detail,
            )
        except Exception:
            pass
        # Forward exc.headers — carries Retry-After from the rate limiter
        extra = dict(exc.headers) if exc.headers else None
        return _json_response_with_id(exc.status_code, body, request_id, extra)

    # ------------------------------------------------------------------ #
    # 4. Starlette HTTPException — raised by Starlette internals /        #
    #    middleware (bypasses FastAPI's handler if not registered)         #
    # ------------------------------------------------------------------ #
    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
        request_id = uuid.uuid4().hex
        _error_counters["http_error"] += 1
        safe_detail = (
            exc.detail
            if isinstance(exc.detail, (str, list, dict, int, float, bool, type(None)))
            else str(exc.detail)
        )
        body = _build_response(exc.status_code, safe_detail, request_id, "http_error")
        try:
            logger.warning(
                "starlette_http_exception",
                request_id=request_id,
                path=_safe_request_path(request),
                method=request.method,
                status_code=exc.status_code,
                detail=safe_detail,
            )
        except Exception:
            pass
        extra = dict(exc.headers) if exc.headers else None
        return _json_response_with_id(exc.status_code, body, request_id, extra)

    # ------------------------------------------------------------------ #
    # 5. Generic unhandled exception — 500                                 #
    # ------------------------------------------------------------------ #
    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        request_id = uuid.uuid4().hex
        _error_counters["server_error"] += 1
        path = _safe_request_path(request)
        exc_type = type(exc).__name__

        # Rec C — Capture in Sentry if available (sentry_sdk.init in main.py)
        if _SENTRY_AVAILABLE:
            try:
                sentry_sdk.capture_exception(exc)
            except Exception:
                pass

        try:
            # Rec D — Offload CPU-bound traceback formatting off the event loop.
            # At 500 concurrent failures, 500× traceback.format_exc() on the event
            # loop creates measurable stall time. run_in_executor moves it to a
            # thread pool, keeping the loop free for other requests.
            loop = asyncio.get_running_loop()
            raw_tb = await loop.run_in_executor(None, traceback.format_exc)

            capped_tb = raw_tb[:_MAX_TRACEBACK_CHARS] + (
                f"\n... [truncated at {_MAX_TRACEBACK_CHARS} chars]"
                if len(raw_tb) > _MAX_TRACEBACK_CHARS
                else ""
            )

            # Rec A — Scrub PII from traceback and error string before any log sink
            scrubbed_tb = _scrub_pii(capped_tb)
            scrubbed_error = _scrub_pii(str(exc))

            # Rec E — Only log if this (exc_type, path) hasn't fired within 60s
            if _should_log_error(exc_type, path):
                logger.error(
                    "unhandled_exception",
                    request_id=request_id,
                    path=path,
                    method=request.method,
                    error=scrubbed_error,
                    exc_type=exc_type,
                    traceback=scrubbed_tb,
                    _sampled=True,
                )
        except Exception:
            # Logger / scrubber failure must never suppress the HTTP response.
            pass

        body = _build_response(500, _MSG_SERVER_ERROR, request_id, "server_error")
        return _json_response_with_id(500, body, request_id)