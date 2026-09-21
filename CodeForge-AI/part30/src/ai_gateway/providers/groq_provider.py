"""
Groq provider adapter.

Groq exposes an OpenAI-compatible Chat Completions endpoint at
POST {base_url}/chat/completions (base_url default:
https://api.groq.com/openai/v1), authenticated with
`Authorization: Bearer <GROQ_API_KEY>`, returning usage as
`usage.prompt_tokens` / `usage.completion_tokens` / `usage.total_tokens`
(verified against current GroqDocs — console.groq.com/docs — at build
time). Model identifiers (e.g. which Llama/other model string is current)
change over time and are NOT hardcoded here — they come from the
ModelRegistry (models/registry.py), which you should keep in sync with
console.groq.com/docs/models.

GROQ_API_KEY is read from Settings and is blank by default. This module
raises loudly (RuntimeError, at call time, not import time) if you try to
actually call the API without setting it — see config.py.
"""

from __future__ import annotations

import time

import httpx

from ..config import Settings
from ..errors import (
    ProviderAuthError,
    ProviderInvalidRequestError,
    ProviderRateLimitError,
    ProviderServerError,
    ProviderTimeoutError,
)
from .base import AIProvider, ProviderRequest, ProviderResponse, ProviderUsage


class GroqProvider(AIProvider):
    name = "groq"

    def __init__(self, settings: Settings, supported_models: frozenset[str], client: httpx.AsyncClient | None = None):
        self._settings = settings
        self._supported_models = supported_models
        self._client = client  # injected in tests; created lazily otherwise

    def supports_model(self, model_id: str) -> bool:
        return model_id in self._supported_models

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self._settings.groq_base_url)
        return self._client

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        api_key = self._settings.require_groq_api_key()
        client = await self._get_client()

        payload = {
            "model": request.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "max_completion_tokens": request.max_output_tokens,
            "temperature": request.temperature,
        }
        if request.response_format_json:
            payload["response_format"] = {"type": "json_object"}

        started = time.monotonic()
        try:
            resp = await client.post(
                "/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=request.timeout_s,
            )
        except httpx.TimeoutException as e:
            raise ProviderTimeoutError(f"Groq request timed out after {request.timeout_s}s") from e
        except httpx.ConnectError as e:
            raise ProviderServerError(f"Could not connect to Groq: {e}") from e

        latency_ms = (time.monotonic() - started) * 1000

        if resp.status_code == 401 or resp.status_code == 403:
            raise ProviderAuthError(f"Groq auth failed ({resp.status_code}): {resp.text[:300]}")
        if resp.status_code == 429:
            retry_after = resp.headers.get("retry-after")
            raise ProviderRateLimitError(
                "Groq rate limit exceeded", retry_after_s=float(retry_after) if retry_after else None
            )
        if resp.status_code == 400 or resp.status_code == 422:
            raise ProviderInvalidRequestError(f"Groq rejected the request ({resp.status_code}): {resp.text[:300]}")
        if resp.status_code >= 500:
            raise ProviderServerError(f"Groq server error {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()

        data = resp.json()
        choice = data["choices"][0]
        usage_raw = data.get("usage") or {}
        usage = ProviderUsage(
            input_tokens=usage_raw.get("prompt_tokens", 0),
            output_tokens=usage_raw.get("completion_tokens", 0),
            cached_tokens=usage_raw.get("prompt_tokens_details", {}).get("cached_tokens", 0),
            estimated="usage" not in data,
        )
        return ProviderResponse(
            text=choice["message"]["content"],
            usage=usage,
            finish_reason=choice.get("finish_reason", "unknown"),
            raw_model_version=data.get("model"),
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        if not self._settings.groq_api_key:
            return False
        try:
            client = await self._get_client()
            resp = await client.get(
                "/models", headers={"Authorization": f"Bearer {self._settings.groq_api_key}"}, timeout=5.0
            )
            return resp.status_code < 500
        except Exception:
            return False
