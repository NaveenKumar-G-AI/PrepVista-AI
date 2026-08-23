"""
PrepVista AI — OpenAI provider adapter.
Uses the openai SDK (openai==1.50.0 already in requirements.txt).
"""
from __future__ import annotations
import asyncio
from collections.abc import AsyncIterator
from app.ai.errors import (
    AuthenticationError, ConfigurationError, MalformedResponseError,
    ProviderTimeoutError, ProviderUnavailableError, RateLimitError,
)
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import (
    CompletedEvent, ErrorEvent, FinishReason, Message, ModelRequest,
    ModelResponse, StreamEvent, TextDeltaEvent, ToolCall, Usage,
)

_FINISH_REASON_MAP: dict[str, FinishReason] = {
    "stop":           FinishReason.stop,
    "length":         FinishReason.length,
    "tool_calls":     FinishReason.tool_calls,
    "content_filter": FinishReason.content_filter,
}


def _to_openai_message(msg: Message) -> dict:
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


class OpenAIAdapter(ModelProvider):
    name = "openai"

    def __init__(self, api_key: str | None, base_url: str | None = None,
                 timeout_seconds: float = 30.0) -> None:
        self._api_key         = api_key
        self._base_url        = base_url
        self._timeout_seconds = timeout_seconds
        self._client          = None

    def _get_client(self):
        if not self._api_key:
            raise ConfigurationError("OPENAI_API_KEY is not set", provider=self.name)
        if self._client is None:
            from openai import AsyncOpenAI
            kwargs: dict = {"api_key": self._api_key}
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    def _build_params(self, request: ModelRequest) -> dict:
        messages = [_to_openai_message(m) for m in request.messages]
        if request.system:
            messages = [{"role": "system", "content": request.system}] + messages
        params: dict = {"model": request.model, "messages": messages}
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
            raise ProviderTimeoutError("OpenAI request timed out", provider=self.name)
        except Exception as exc:
            self._classify(exc)
        choice = resp.choices[0]
        usage  = resp.usage
        return ModelResponse(
            content=choice.message.content,
            provider=self.name,
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
                yield CompletedEvent(response=ModelResponse(
                    content="".join(accumulated), provider=self.name, model=request.model,
                    finish_reason=FinishReason.stop, usage=Usage.unavailable(),
                ))
            except Exception as exc:
                from app.ai.types import ProviderErrorInfo
                yield ErrorEvent(error=ProviderErrorInfo(code="provider_error", message=str(exc), provider=self.name))
        return _gen()

    async def health(self) -> ProviderHealth:
        if not self._api_key:
            return ProviderHealth(status=ProviderHealthStatus.misconfigured, provider=self.name, detail=f"{self.name.upper()}_API_KEY not set")
        return ProviderHealth(status=ProviderHealthStatus.unknown, provider=self.name, detail="Key configured; no free ping endpoint")

    def _classify(self, exc: Exception) -> None:
        msg = str(exc).lower()
        if "401" in msg or "authentication" in msg:
            raise AuthenticationError(str(exc), provider=self.name)
        if "429" in msg or "rate limit" in msg:
            raise RateLimitError(str(exc), provider=self.name)
        if "timeout" in msg:
            raise ProviderTimeoutError(str(exc), provider=self.name)
        raise ProviderUnavailableError(str(exc), provider=self.name)