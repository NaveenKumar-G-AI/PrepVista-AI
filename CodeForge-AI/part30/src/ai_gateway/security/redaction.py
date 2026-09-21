"""
Log redaction (Feature 70).

Anything that might get logged — exception messages from provider HTTP
calls, debug traces, admin audit entries — should pass through
`redact_secrets` first. This is a defense-in-depth measure: the rest of
the codebase already avoids logging raw prompts/responses/API
keys/student code by construction (see telemetry/events.py's module
docstring and OutputValidationError's `raw_output` field, which callers
must consciously choose to persist, never something that's logged
automatically) — this module catches secrets that leak in anyway, e.g.
inside a provider error message that happened to echo back a header.

Patterns covered are intentionally broad-strokes (common API key shapes,
bearer tokens, Postgres/Redis connection strings with embedded
credentials) rather than an exhaustive list — see module-level
`_PATTERNS` for exactly what's covered, and extend it before relying on
this for a secret shape not listed here.
"""

from __future__ import annotations

import re

_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Authorization: Bearer <token>  /  Authorization: Basic <token>
    (re.compile(r"(?i)(authorization\s*:\s*(?:bearer|basic)\s+)([A-Za-z0-9\-_.=]+)"), r"\1[REDACTED]"),
    # x-goog-api-key: <key>  (Gemini) — allow for optional surrounding
    # quotes, since this often appears inside a Python dict repr or JSON.
    (re.compile(r"(?i)(x-goog-api-key['\"]?\s*:\s*['\"]?)([A-Za-z0-9\-_]+)"), r"\1[REDACTED]"),
    # generic "api_key": "..." / api_key=... in JSON or query strings
    (re.compile(r'(?i)("?api[_-]?key"?\s*[:=]\s*"?)([A-Za-z0-9\-_]{8,})(")?'), r"\1[REDACTED]\3"),
    # Postgres/Redis connection strings with embedded user:password@
    (re.compile(r"(?i)((?:postgres(?:ql)?|redis)://[^:/\s]+:)([^@/\s]+)(@)"), r"\1[REDACTED]\3"),
    # Groq-style keys (gsk_...) and generic long opaque tokens
    (re.compile(r"\bgsk_[A-Za-z0-9]{20,}\b"), "[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "[REDACTED]"),
]


def redact_secrets(text: str) -> str:
    if not text:
        return text
    redacted = text
    for pattern, replacement in _PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def safe_log_context(*, request_id: str, feature: str, operation: str, provider: str | None = None,
                      model_id: str | None = None, status: str | None = None) -> dict:
    """Whitelist, not blocklist: only IDs and enum-like fields ever go into
    a log line built from this — never a prompt, a response body, or
    student code (Feature 71: keep operational metadata separate from
    sensitive content)."""
    return {
        "request_id": request_id, "feature": feature, "operation": operation,
        "provider": provider, "model_id": model_id, "status": status,
    }
