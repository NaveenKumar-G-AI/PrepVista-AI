"""
Gemini provider adapter.

Uses the REST `generateContent` endpoint:
POST {base_url}/models/{model}:generateContent
authenticated with header `x-goog-api-key: <GEMINI_API_KEY>`, returning
usage in `usageMetadata.promptTokenCount` /
`usageMetadata.candidatesTokenCount` / `usageMetadata.totalTokenCount`
(verified against current ai.google.dev/api docs at build time).

GEMINI_API_KEY is read from Settings and is blank by default — see
config.py. This adapter raises loudly at call time if it's missing rather
than silently no-op-ing.
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


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, settings: Settings, supported_models: frozenset[str], client: httpx.AsyncClient | None = None):
        self._settings = settings
        self._supported_models = supported_models
        self._client = client

    def supports_model(self, model_id: str) -> bool:
        return model_id in self._supported_models

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self._settings.gemini_base_url)
        return self._client

    def _to_gemini_payload(self, request: ProviderRequest) -> dict:
        system_parts = [m.content for m in request.messages if m.role == "system"]
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in request.messages
            if m.role != "system"
        ]
        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": request.max_output_tokens,
                "temperature": request.temperature,
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_parts)}]}
        if request.response_format_json:
            payload["generationConfig"]["responseMimeType"] = "application/json"
        return payload

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        api_key = self._settings.require_gemini_api_key()
        client = await self._get_client()
        payload = self._to_gemini_payload(request)

        started = time.monotonic()
        try:
            resp = await client.post(
                f"/models/{request.model_id}:generateContent",
                json=payload,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                timeout=request.timeout_s,
            )
        except httpx.TimeoutException as e:
            raise ProviderTimeoutError(f"Gemini request timed out after {request.timeout_s}s") from e
        except httpx.ConnectError as e:
            raise ProviderServerError(f"Could not connect to Gemini: {e}") from e

        latency_ms = (time.monotonic() - started) * 1000

        if resp.status_code == 401 or resp.status_code == 403:
            raise ProviderAuthError(f"Gemini auth failed ({resp.status_code}): {resp.text[:300]}")
        if resp.status_code == 429:
            raise ProviderRateLimitError("Gemini rate limit exceeded")
        if resp.status_code == 400:
            raise ProviderInvalidRequestError(f"Gemini rejected the request: {resp.text[:300]}")
        if resp.status_code >= 500:
            raise ProviderServerError(f"Gemini server error {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            # e.g. blocked by safety filters — treat as a permanent error, not a bug to retry.
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no_candidates")
            raise ProviderInvalidRequestError(f"Gemini returned no candidates (reason: {reason})")

        candidate = candidates[0]
        text = "".join(p.get("text", "") for p in candidate.get("content", {}).get("parts", []))
        usage_raw = data.get("usageMetadata") or {}
        usage = ProviderUsage(
            input_tokens=usage_raw.get("promptTokenCount", 0),
            output_tokens=usage_raw.get("candidatesTokenCount", 0),
            cached_tokens=usage_raw.get("cachedContentTokenCount", 0),
            estimated="usageMetadata" not in data,
        )
        return ProviderResponse(
            text=text,
            usage=usage,
            finish_reason=candidate.get("finishReason", "unknown"),
            raw_model_version=data.get("modelVersion"),
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        if not self._settings.gemini_api_key:
            return False
        try:
            client = await self._get_client()
            resp = await client.get(
                "/models", headers={"x-goog-api-key": self._settings.gemini_api_key}, timeout=5.0
            )
            return resp.status_code < 500
        except Exception:
            return False
