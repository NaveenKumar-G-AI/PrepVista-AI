"""MockProvider — deterministic in-memory provider for tests (no SDK, no network)."""
from __future__ import annotations
import asyncio
from collections.abc import AsyncIterator
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import (ModelRequest, ModelResponse, StreamEvent,
                           FinishReason, Usage, TextDeltaEvent, CompletedEvent)


class MockProvider(ModelProvider):
    """Deterministic mock — always returns 'Mock response.' Never raises."""
    name = "mock"

    async def generate(self, request: ModelRequest) -> ModelResponse:
        content = "Mock response."
        return ModelResponse(
            content=content, provider="mock", model=request.model,
            finish_reason=FinishReason.stop, usage=Usage(input_tokens=5, output_tokens=3, total_tokens=8),
        )

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        async def _gen():
            content = "Mock response."
            yield TextDeltaEvent(text=content)
            resp = ModelResponse(
                content=content, provider="mock", model=request.model,
                finish_reason=FinishReason.stop, usage=Usage(input_tokens=5, output_tokens=3, total_tokens=8),
            )
            yield CompletedEvent(response=resp)
        return _gen()

    async def health(self) -> ProviderHealth:
        return ProviderHealth(status=ProviderHealthStatus.available, provider="mock", detail="In-memory mock")