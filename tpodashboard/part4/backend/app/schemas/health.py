"""Schemas for the health check endpoint."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Reports overall service liveness and dependency status."""

    status: Literal["ok", "degraded"] = Field(description="Overall service status.")
    environment: str = Field(description="Active application environment.")
    version: str = Field(description="Application version.")
    database: Literal["ok", "unreachable"] = Field(description="Database connectivity status.")
