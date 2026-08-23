"""
PrepVista AI — ModelProvider ABC.
Ported from Part 4. Concrete adapters live in app/ai/providers/.
"""
from __future__ import annotations
import enum
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from pydantic import BaseModel
from app.ai.types import ModelRequest, ModelResponse, StreamEvent


class ProviderHealthStatus(enum.StrEnum):
    available     = "available"
    unavailable   = "unavailable"
    misconfigured = "misconfigured"
    unknown       = "unknown"


class ProviderHealth(BaseModel):
    status:   ProviderHealthStatus
    provider: str
    detail:   str | None = None


class ModelProvider(ABC):
    name: str

    @abstractmethod
    async def generate(self, request: ModelRequest) -> ModelResponse: ...

    @abstractmethod
    def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]: ...

    @abstractmethod
    async def health(self) -> ProviderHealth: ...

    async def aclose(self) -> None:
        return None