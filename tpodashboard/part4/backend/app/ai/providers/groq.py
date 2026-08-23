"""Groq provider adapter.

Uses Groq's official Python SDK (`groq`, `AsyncGroq`), confirmed current
as of August 2026 (see `docs/ai-providers.md` §Providers for sources).
Groq's API is OpenAI-chat-completions-compatible; the actual request/
response/error translation lives in `openai_compatible.py` and is shared
with the Cerebras and OpenRouter adapters. This file only owns: client
construction/lifecycle and wiring Groq's specific exceptions into that
shared translation.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from pydantic import SecretStr

from app.ai.errors import ConfigurationError
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.providers.openai_compatible import (
    classify_error,
    translate_request,
    translate_response,
    translate_stream,
)
from app.ai.types import ModelRequest, ModelResponse, StreamEvent


class GroqProvider(ModelProvider):
    """Adapter for Groq's hosted inference API."""

    name = "groq"

    def __init__(
        self,
        *,
        api_key: SecretStr | None,
        timeout_seconds: float = 60.0,
        client: Any | None = None,
    ) -> None:
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._client = client  # injected in tests; constructed lazily otherwise

    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if self._api_key is None:
            raise ConfigurationError("GROQ_API_KEY is not configured.", provider=self.name)
        from groq import AsyncGroq

        self._client = AsyncGroq(
            api_key=self._api_key.get_secret_value(), timeout=self._timeout_seconds
        )
        return self._client

    async def generate(self, request: ModelRequest) -> ModelResponse:
        client = self._ensure_client()
        kwargs = translate_request(request)
        try:
            completion = await client.chat.completions.create(
                timeout=request.timeout_seconds or self._timeout_seconds, **kwargs
            )
        except Exception as exc:  # noqa: BLE001 -- normalized immediately below
            raise classify_error(exc, provider=self.name, model=request.model) from exc
        return translate_response(completion, provider=self.name)

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:
        client = self._ensure_client()
        kwargs = translate_request(request)
        try:
            chunk_stream = await client.chat.completions.create(
                timeout=request.timeout_seconds or self._timeout_seconds, stream=True, **kwargs
            )
        except Exception as exc:  # noqa: BLE001
            from app.ai.types import ErrorEvent

            yield ErrorEvent(
                error=classify_error(exc, provider=self.name, model=request.model).to_info()
            )
            return

        async for event in translate_stream(chunk_stream, provider=self.name, model=request.model):
            yield event

    async def health(self) -> ProviderHealth:
        if self._api_key is None and self._client is None:
            return ProviderHealth(
                status=ProviderHealthStatus.misconfigured,
                provider=self.name,
                detail="GROQ_API_KEY is not configured.",
            )
        try:
            client = self._ensure_client()
            await client.models.list()
            return ProviderHealth(status=ProviderHealthStatus.available, provider=self.name)
        except Exception as exc:  # noqa: BLE001 -- health check must never raise
            return ProviderHealth(
                status=ProviderHealthStatus.unavailable, provider=self.name, detail=str(exc)
            )

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.close()
