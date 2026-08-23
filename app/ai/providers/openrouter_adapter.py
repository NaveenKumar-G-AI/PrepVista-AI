"""
PrepVista AI — OpenRouter provider adapter.
Uses the openai SDK pointed at https://openrouter.ai/api/v1 (per OpenRouter docs).
"""
from __future__ import annotations
from app.ai.providers.openai_adapter import OpenAIAdapter
from app.ai.provider import ProviderHealth, ProviderHealthStatus


class OpenRouterAdapter(OpenAIAdapter):
    name = "openrouter"

    def __init__(self, api_key: str | None, timeout_seconds: float = 30.0) -> None:
        super().__init__(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            timeout_seconds=timeout_seconds,
        )

    async def health(self) -> ProviderHealth:
        if not self._api_key:
            return ProviderHealth(status=ProviderHealthStatus.misconfigured, provider="openrouter", detail="OPENROUTER_API_KEY not set")
        return ProviderHealth(status=ProviderHealthStatus.unknown, provider="openrouter", detail="Key configured; routes to openrouter.ai")