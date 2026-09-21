"""
A fully scriptable in-memory provider used ONLY by the test suite
(tests/test_gateway_end_to_end.py, etc.) and local examples.

This is not a "fake implementation" of a real provider — it exists so that
retry/circuit-breaker/fallback logic can be verified deterministically
without live network access or real API keys, which this sandbox does not
have. It must never be wired into the production gateway config.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Callable, Optional

from .base import AIProvider, ProviderRequest, ProviderResponse, ProviderUsage


@dataclass
class MockProvider(AIProvider):
    name: str
    supported_models: frozenset[str]
    # A queue of behaviors to pop through, one per call. Each entry is either
    # an Exception instance (raised) or a ProviderResponse (returned).
    # If the queue is exhausted, `default_response` is used forever.
    script: list = field(default_factory=list)
    default_response: Optional[ProviderResponse] = None
    call_count: int = 0
    healthy: bool = True
    delay_s: float = 0.0  # artificial latency, used to make coalescing races observable in tests

    def supports_model(self, model_id: str) -> bool:
        return model_id in self.supported_models

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        self.call_count += 1
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.script:
            behavior = self.script.pop(0)
            if isinstance(behavior, Exception):
                raise behavior
            return behavior
        if self.default_response is not None:
            return self.default_response
        return ProviderResponse(
            text='{"ok": true}',
            usage=ProviderUsage(input_tokens=50, output_tokens=20),
            finish_reason="stop",
        )

    async def health_check(self) -> bool:
        return self.healthy
