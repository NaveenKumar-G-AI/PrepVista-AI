"""
Provider abstraction (Feature 8).

Business logic (gateway.py, routing/router.py, ...) depends only on the
`AIProvider` interface below, never on the Groq SDK, the Gemini SDK, or raw
HTTP calls. Concrete providers (groq_provider.py, gemini_provider.py,
mock_provider.py) live behind this interface so a "FutureProvider" can be
added later without touching anything upstream of it.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class ProviderMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(frozen=True)
class ProviderRequest:
    model_id: str
    messages: tuple[ProviderMessage, ...]
    max_output_tokens: int
    temperature: float = 0.2
    response_format_json: bool = False
    timeout_s: float = 30.0


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0
    estimated: bool = False  # True only if the provider did not return exact usage

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass(frozen=True)
class ProviderResponse:
    text: str
    usage: ProviderUsage
    finish_reason: str
    raw_model_version: Optional[str] = None
    latency_ms: Optional[float] = None


class AIProvider(abc.ABC):
    """Every concrete provider must implement this. Errors must be raised
    using the exception hierarchy in errors.py (TransientProviderError vs
    PermanentProviderError) so resilience/retry.py can classify them
    correctly without knowing which vendor is behind the call."""

    name: str

    @abc.abstractmethod
    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        ...

    @abc.abstractmethod
    def supports_model(self, model_id: str) -> bool:
        ...

    @abc.abstractmethod
    async def health_check(self) -> bool:
        """Cheap liveness probe used by resilience/circuit_breaker.py's
        recovery check. Must not raise — return False on failure."""
        ...
