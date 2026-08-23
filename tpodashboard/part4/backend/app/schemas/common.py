"""Response schemas shared across the API, primarily for OpenAPI docs."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str = Field(description="Stable, machine-readable error code.")
    message: str = Field(description="Human-readable error description.")
    details: dict[str, Any] = Field(
        default_factory=dict, description="Optional structured context."
    )


class ErrorResponse(BaseModel):
    """The shape of every error returned by the API."""

    error: ErrorDetail
