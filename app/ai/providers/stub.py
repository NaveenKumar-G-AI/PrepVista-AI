"""StubProvider — placeholder for adapters whose SDK is not installed."""
from __future__ import annotations
from collections.abc import AsyncIterator
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import ModelRequest, ModelResponse, FinishReason, StreamEvent, Usage, ErrorEvent, ProviderErrorInfo
from app.ai.errors import ConfigurationError


class StubProvider(ModelProvider):
    def __init__(self, name: str, reason: str) -> None:
        self.name   = name
        self._reason = reason

    async def generate(self, request: ModelRequest) -> ModelResponse:
        raise ConfigurationError(self._reason, provider=self.name)

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        async def _gen():
            yield ErrorEvent(error=ProviderErrorInfo(code="configuration_error", message=self._reason, provider=self.name))
        return _gen()

    async def health(self) -> ProviderHealth:
        return ProviderHealth(status=ProviderHealthStatus.misconfigured, provider=self.name, detail=self._reason)