"""Gemini provider adapter.

Uses Google's official `google-genai` SDK (the unified SDK that has been
GA and the recommended integration path since May 2025, superseding the
deprecated `google-generativeai` package), confirmed current as of August
2026 (see `docs/ai-providers.md` §Providers for sources).

Gemini's wire format genuinely differs from the OpenAI-compatible
providers (distinct `contents`/`Part` structure, `system_instruction` as a
dedicated config field, "model" instead of "assistant" as the model's
role name, function calls represented as typed `Part.function_call`
rather than a `tool_calls` array), so this adapter owns its own
translation instead of sharing `openai_compatible.py`.

Deliberately not used: Gemini's newer, stateful "Interactions" API
(`client.interactions.create(...)`, server-side conversation threads via
`previous_interaction_id`). That API has no equivalent concept in any
other provider implemented here and doesn't fit this layer's stateless
`ModelRequest -> ModelResponse` contract, where the caller always supplies
the full message history itself. `client.aio.models.generate_content(...)`
remains fully supported and is the correct fit -- see
`docs/ai-providers.md` §Providers for the full reasoning.

Caveat: `_translate_tool_result_message`'s exact `role`/`Part` shape for
returning a tool result to Gemini on a later turn is implemented per
current documentation but has not been exercised against a live response
in this environment (no network egress to Gemini's API here -- see
`docs/ai-providers.md` §Testing). Everything else in this file (request
construction, response/usage/finish-reason parsing, error classification)
is covered by adapter tests using an injected fake client.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from pydantic import SecretStr

from app.ai.errors import (
    AuthenticationError,
    ConfigurationError,
    InvalidRequestError,
    MalformedResponseError,
    ModelNotFoundError,
    ProviderError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import (
    CompletedEvent,
    ErrorEvent,
    FinishReason,
    Message,
    ModelRequest,
    ModelResponse,
    Role,
    StreamEvent,
    TextDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    Usage,
    UsageEvent,
)

_FINISH_REASON_MAP: dict[str, FinishReason] = {
    "STOP": FinishReason.stop,
    "MAX_TOKENS": FinishReason.length,
    "SAFETY": FinishReason.content_filter,
    "RECITATION": FinishReason.content_filter,
    "BLOCKLIST": FinishReason.content_filter,
    "PROHIBITED_CONTENT": FinishReason.content_filter,
    "SPII": FinishReason.content_filter,
}


def _translate_message(message: Message, types_module: Any) -> Any:
    """Translate one internal `Message` into a Gemini `types.Content`."""
    if message.role is Role.assistant and message.tool_calls:
        parts = [
            types_module.Part(
                function_call=types_module.FunctionCall(name=call.name, args=call.arguments)
            )
            for call in message.tool_calls
        ]
        return types_module.Content(role="model", parts=parts)

    if message.role is Role.tool:
        # The result of a prior tool call, sent back to Gemini as a
        # function_response part. See module docstring caveat.
        return types_module.Content(
            role="user",
            parts=[
                types_module.Part(
                    function_response=types_module.FunctionResponse(
                        name=message.name or "unknown_tool",
                        response={"result": message.content or ""},
                    )
                )
            ],
        )

    role = "model" if message.role is Role.assistant else "user"
    return types_module.Content(role=role, parts=[types_module.Part(text=message.content or "")])


def translate_request(request: ModelRequest, types_module: Any) -> dict[str, Any]:
    """Build the kwargs for `client.aio.models.generate_content(**kwargs)`."""
    turns = request.messages
    system_text = request.system
    if system_text is None and turns and turns[0].role is Role.system:
        system_text = turns[0].content
        turns = turns[1:]

    contents = [_translate_message(m, types_module) for m in turns]

    config_kwargs: dict[str, Any] = {}
    if system_text:
        config_kwargs["system_instruction"] = system_text
    if request.temperature is not None:
        config_kwargs["temperature"] = request.temperature
    if request.max_output_tokens is not None:
        config_kwargs["max_output_tokens"] = request.max_output_tokens
    if request.stop_sequences:
        config_kwargs["stop_sequences"] = request.stop_sequences
    if request.tools:
        function_declarations = [
            types_module.FunctionDeclaration(
                name=tool.name, description=tool.description, parameters=tool.input_schema
            )
            for tool in request.tools
        ]
        config_kwargs["tools"] = [types_module.Tool(function_declarations=function_declarations)]
    config_kwargs.update(request.provider_options)

    kwargs: dict[str, Any] = {"model": request.model, "contents": contents}
    if config_kwargs:
        kwargs["config"] = types_module.GenerateContentConfig(**config_kwargs)
    return kwargs


def _extract_tool_calls(response: Any) -> list[ToolCall]:
    calls: list[ToolCall] = []
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return calls
    content = getattr(candidates[0], "content", None)
    parts = getattr(content, "parts", None) or []
    for index, part in enumerate(parts):
        function_call = getattr(part, "function_call", None)
        if function_call is not None:
            calls.append(
                ToolCall(
                    id=getattr(function_call, "id", None) or f"gemini-call-{index}",
                    name=function_call.name,
                    arguments=dict(function_call.args or {}),
                )
            )
    return calls


def translate_response(response: Any, *, provider: str) -> ModelResponse:
    """Translate a `types.GenerateContentResponse` into a `ModelResponse`."""
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        raise MalformedResponseError("Response had no candidates.", provider=provider)

    tool_calls = _extract_tool_calls(response)
    text = getattr(response, "text", None)

    raw_finish_reason = getattr(candidates[0], "finish_reason", None)
    raw_finish_reason_name = getattr(raw_finish_reason, "name", raw_finish_reason)
    finish_reason = (
        FinishReason.tool_calls
        if tool_calls
        else _FINISH_REASON_MAP.get(str(raw_finish_reason_name), FinishReason.unknown)
    )

    usage_metadata = getattr(response, "usage_metadata", None)
    usage = (
        Usage(
            input_tokens=getattr(usage_metadata, "prompt_token_count", None),
            output_tokens=getattr(usage_metadata, "candidates_token_count", None),
            total_tokens=getattr(usage_metadata, "total_token_count", None),
        )
        if usage_metadata is not None
        else Usage.unavailable()
    )

    return ModelResponse(
        content=text,
        provider=provider,
        model=getattr(response, "model_version", None) or "",
        finish_reason=finish_reason,
        usage=usage,
        tool_calls=tool_calls,
        request_id=getattr(response, "response_id", None),
    )


def classify_error(exc: Exception, *, provider: str, model: str | None) -> ProviderError:
    """Classify an exception raised by the `google-genai` SDK.

    Uses duck typing (`getattr(exc, "code", None)`) rather than an
    `isinstance` check against `google.genai.errors.APIError`, matching
    the resilience pattern in `openai_compatible.classify_error`: it
    degrades gracefully across SDK versions and is exercised by tests
    using plain fake exception objects, not a real (and potentially
    version-fragile) imported exception class.
    `google.genai.errors.APIError` (the base for `ClientError`/
    `ServerError`) carries `.code` (the HTTP status) and `.message`, which
    is exactly the shape this function reads.
    """
    message = str(exc)
    kwargs: dict[str, Any] = {"provider": provider, "model": model}

    status_code = getattr(exc, "code", None)
    if isinstance(status_code, int):
        kwargs["status_code"] = status_code
        message = getattr(exc, "message", None) or message
        if status_code in (401, 403):
            return AuthenticationError(message, **kwargs)
        if status_code == 429:
            return RateLimitError(message, **kwargs)
        if status_code == 404:
            return ModelNotFoundError(message, **kwargs)
        if 400 <= status_code < 500:
            return InvalidRequestError(message, **kwargs)
        if status_code >= 500:
            return ProviderUnavailableError(message, **kwargs)

    type_name = type(exc).__name__
    if "Timeout" in type_name:
        return ProviderTimeoutError(message, **kwargs)
    if "Connection" in type_name:
        return ProviderUnavailableError(message, **kwargs)
    return ProviderError(message, **kwargs)


class GeminiProvider(ModelProvider):
    """Adapter for the Gemini Developer API."""

    name = "gemini"

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
            raise ConfigurationError("GEMINI_API_KEY is not configured.", provider=self.name)
        from google import genai

        self._client = genai.Client(api_key=self._api_key.get_secret_value())
        return self._client

    def _types_module(self) -> Any:
        from google.genai import types

        return types

    async def generate(self, request: ModelRequest) -> ModelResponse:
        client = self._ensure_client()
        kwargs = translate_request(request, self._types_module())
        try:
            response = await client.aio.models.generate_content(**kwargs)
        except Exception as exc:  # noqa: BLE001 -- normalized immediately below
            raise classify_error(exc, provider=self.name, model=request.model) from exc
        return translate_response(response, provider=self.name)

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:
        client = self._ensure_client()
        kwargs = translate_request(request, self._types_module())

        content_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        usage = Usage.unavailable()
        model_version = request.model
        response_id: str | None = None
        finish_reason = FinishReason.unknown

        try:
            chunk_stream = await client.aio.models.generate_content_stream(**kwargs)
            async for chunk in chunk_stream:
                model_version = getattr(chunk, "model_version", None) or model_version
                response_id = getattr(chunk, "response_id", None) or response_id

                delta_text = getattr(chunk, "text", None)
                if delta_text:
                    content_parts.append(delta_text)
                    yield TextDeltaEvent(text=delta_text)

                chunk_tool_calls = _extract_tool_calls(chunk)
                for index, call in enumerate(chunk_tool_calls):
                    yield ToolCallDeltaEvent(
                        index=index,
                        id=call.id,
                        name=call.name,
                        arguments_delta=str(call.arguments) if call.arguments else None,
                    )
                if chunk_tool_calls:
                    tool_calls = chunk_tool_calls

                usage_metadata = getattr(chunk, "usage_metadata", None)
                if usage_metadata is not None:
                    usage = Usage(
                        input_tokens=getattr(usage_metadata, "prompt_token_count", None),
                        output_tokens=getattr(usage_metadata, "candidates_token_count", None),
                        total_tokens=getattr(usage_metadata, "total_token_count", None),
                    )

                candidates = getattr(chunk, "candidates", None) or []
                if candidates:
                    raw = getattr(candidates[0], "finish_reason", None)
                    raw_name = getattr(raw, "name", raw)
                    if raw_name:
                        finish_reason = _FINISH_REASON_MAP.get(str(raw_name), FinishReason.unknown)
        except Exception as exc:  # noqa: BLE001
            error = (
                exc
                if isinstance(exc, ProviderError)
                else classify_error(exc, provider=self.name, model=request.model)
            )
            yield ErrorEvent(error=error.to_info())
            return

        if tool_calls:
            finish_reason = FinishReason.tool_calls

        yield UsageEvent(usage=usage)
        yield CompletedEvent(
            response=ModelResponse(
                content="".join(content_parts) or None,
                provider=self.name,
                model=model_version,
                finish_reason=finish_reason,
                usage=usage,
                tool_calls=tool_calls,
                request_id=response_id,
            )
        )

    async def health(self) -> ProviderHealth:
        if self._api_key is None and self._client is None:
            return ProviderHealth(
                status=ProviderHealthStatus.misconfigured,
                provider=self.name,
                detail="GEMINI_API_KEY is not configured.",
            )
        try:
            client = self._ensure_client()
            await client.aio.models.list(config={"page_size": 1})
            return ProviderHealth(status=ProviderHealthStatus.available, provider=self.name)
        except Exception as exc:  # noqa: BLE001 -- health check must never raise
            return ProviderHealth(
                status=ProviderHealthStatus.unavailable, provider=self.name, detail=str(exc)
            )

    async def aclose(self) -> None:
        if self._client is not None:
            close = getattr(self._client, "aio", None)
            close = getattr(close, "close", None) if close is not None else None
            if close is not None:
                await close()
