"""
PrepVista AI — Groq provider adapter.
Uses the groq SDK (groq==0.11.0 already in requirements.txt).
Implements the OpenAI-compatible chat-completions wire format.
"""
from __future__ import annotations
import asyncio
from collections.abc import AsyncIterator
from pydantic import SecretStr
from app.ai.errors import (
    AuthenticationError, ConfigurationError, MalformedResponseError,
    ProviderTimeoutError, ProviderUnavailableError, RateLimitError,
)
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import (
    CompletedEvent, ErrorEvent, FinishReason, Message, ModelRequest,
    ModelResponse, Role, StreamEvent, TextDeltaEvent, ToolCall, Usage,
)

_FINISH_REASON_MAP: dict[str, FinishReason] = {
    "stop":          FinishReason.stop,
    "length":        FinishReason.length,
    "tool_calls":    FinishReason.tool_calls,
    "content_filter": FinishReason.content_filter,
}


def _to_groq_message(msg: Message) -> dict:
    out: dict = {"role": msg.role.value}
    if msg.content is not None:
        out["content"] = msg.content
    if msg.tool_calls:
        out["tool_calls"] = [
            {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": str(tc.arguments)}}
            for tc in msg.tool_calls
        ]
    if msg.tool_call_id:
        out["tool_call_id"] = msg.tool_call_id
    return out


class GroqAdapter(ModelProvider):
    name = "groq"

    def __init__(self, api_key: str | None, timeout_seconds: float = 30.0) -> None:
        self._api_key         = api_key
        self._timeout_seconds = timeout_seconds
        self._client = None

    def _get_client(self):
        if not self._api_key:
            raise ConfigurationError("GROQ_API_KEY is not set", provider="groq")
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=self._api_key)
        return self._client

    def _build_params(self, request: ModelRequest) -> dict:
        params: dict = {
            "model":    request.model,
            "messages": [_to_groq_message(m) for m in request.messages],
        }
        if request.system:
            params["messages"] = [{"role": "system", "content": request.system}] + params["messages"]
        if request.temperature is not None:
            params["temperature"] = request.temperature
        if request.max_output_tokens is not None:
            params["max_tokens"] = request.max_output_tokens
        return params

    async def generate(self, request: ModelRequest) -> ModelResponse:
        client = self._get_client()
        try:
            resp = await asyncio.wait_for(
                client.chat.completions.create(**self._build_params(request)),
                timeout=request.timeout_seconds or self._timeout_seconds,
            )
        except asyncio.TimeoutError:
            raise ProviderTimeoutError("Groq request timed out", provider="groq")
        except Exception as exc:
            self._classify(exc)
        choice = resp.choices[0]
        usage  = resp.usage
        return ModelResponse(
            content=choice.message.content,
            provider="groq",
            model=resp.model or request.model,
            finish_reason=_FINISH_REASON_MAP.get(choice.finish_reason or "", FinishReason.unknown),
            usage=Usage(
                input_tokens=usage.prompt_tokens if usage else None,
                output_tokens=usage.completion_tokens if usage else None,
                total_tokens=usage.total_tokens if usage else None,
            ),
        )

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        async def _gen():
            try:
                client = self._get_client()
                params = self._build_params(request)
                params["stream"] = True
                accumulated = []
                async for chunk in await client.chat.completions.create(**params):
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        accumulated.append(delta.content)
                        yield TextDeltaEvent(text=delta.content)
                full_content = "".join(accumulated)
                yield CompletedEvent(response=ModelResponse(
                    content=full_content, provider="groq", model=request.model,
                    finish_reason=FinishReason.stop, usage=Usage.unavailable(),
                ))
            except Exception as exc:
                from app.ai.types import ProviderErrorInfo
                info = ProviderErrorInfo(code="provider_error", message=str(exc), provider="groq")
                yield ErrorEvent(error=info)
        return _gen()

    async def health(self) -> ProviderHealth:
        if not self._api_key:
            return ProviderHealth(status=ProviderHealthStatus.misconfigured, provider="groq", detail="GROQ_API_KEY not set")
        return ProviderHealth(status=ProviderHealthStatus.unknown, provider="groq", detail="Key configured; no ping endpoint")

    def _classify(self, exc: Exception) -> None:
        msg = str(exc).lower()
        if "401" in msg or "authentication" in msg or "api key" in msg:
            raise AuthenticationError(str(exc), provider="groq")
        if "429" in msg or "rate limit" in msg:
            raise RateLimitError(str(exc), provider="groq")
        if "timeout" in msg:
            raise ProviderTimeoutError(str(exc), provider="groq")
        raise ProviderUnavailableError(str(exc), provider="groq")