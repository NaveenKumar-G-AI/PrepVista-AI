"""
PrepVista AI - Interviews Schemas
Extracted from interviews.py.
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator
from app.routers.interviews_helpers import _normalize_proctoring_mode, _clip_text, _MAX_VIOLATION_TYPE_LEN, _MAX_VIOLATION_DETAIL_LEN, _MAX_REASON_LEN
from typing import Any
from app.routers.interviews_helpers import _MIN_ACCESS_TOKEN_LEN, _CLIENT_REQ_ID_RE, _VIOLATION_TYPE_RE

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
