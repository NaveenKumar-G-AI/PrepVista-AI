"""The stable provider interface.

Future code (the eventual coding agent, planner, etc.) should depend only
on `ModelProvider` -- never on `GeminiProvider`, `GroqProvider`, or any
other concrete adapter class directly. Obtain a provider through
`app.ai.registry.ProviderRegistry`, not by importing an adapter module.

Implemented as an `abc.ABC` rather than a bare `typing.Protocol`: this
family needs shared lifecycle behavior (a default no-op `aclose()` that
most adapters override) and participates in a name-keyed registry, which
suits nominal (inheritance-based) typing better than a purely structural
Protocol. Concrete adapters live in `app/ai/providers/`.
"""

from __future__ import annotations

import enum
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from pydantic import BaseModel

from app.ai.types import ModelRequest, ModelResponse, StreamEvent


class ProviderHealthStatus(enum.StrEnum):
    """See `ModelProvider.health()`."""

    available = "available"
    unavailable = "unavailable"
    misconfigured = "misconfigured"
    unknown = "unknown"


class ProviderHealth(BaseModel):
    status: ProviderHealthStatus
    provider: str
    detail: str | None = None


class ModelProvider(ABC):
    """Base class every concrete provider adapter implements."""

    name: str

    @abstractmethod
    async def generate(self, request: ModelRequest) -> ModelResponse:
        """Generate a complete response for `request`.

        Raises an `app.ai.errors.ProviderError` subclass on failure. Never
        raises a raw provider SDK exception.
        """

    @abstractmethod
    def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:
        """Stream a response for `request` as normalized `StreamEvent`s.

        This is an async generator: `async for event in provider.stream(request)`.
        The final event is always either a `CompletedEvent` (success) or an
        `ErrorEvent` (failure) -- failures are yielded, not raised, so
        callers can use one uniform loop for both outcomes. See
        `app.ai.types.StreamEvent`.
        """

    @abstractmethod
    async def health(self) -> ProviderHealth:
        """A lightweight, bounded-cost check of whether this provider is usable.

        Must not perform a costly generation request. See each adapter's
        docstring for exactly what it checks -- the honest answer, where a
        real reachability check isn't safely available, is
        `ProviderHealthStatus.unknown`.
        """

    async def aclose(self) -> None:
        """Release any held resources (HTTP connections, etc.).

        Default no-op; adapters that hold a lifecycle-managed client
        override this. Safe to call multiple times.
        """
        return None
