"""Shared translation logic for OpenAI chat-completions-compatible providers.

Groq, Cerebras, and OpenRouter all speak the same wire format (OpenAI's
`chat.completions` shape) and, not coincidentally, their official Python
SDKs (`groq`, `cerebras.cloud.sdk`, and -- for OpenRouter, which has no
dedicated SDK of its own -- `openai` itself) are all built on the same
underlying SDK generator, so their request/response/error *shapes* are
effectively identical even though each is a distinct client class.

This module holds that shared translation once instead of copy-pasting it
into three adapter files (see `groq.py`, `cerebras.py`, `openrouter.py`,
each of which is a thin wrapper: construct the right client, call these
functions). If a fifth OpenAI-compatible provider is ever added, its
adapter should look the same way -- see `docs/ai-providers.md` §Adding a
new provider.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from app.ai.errors import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    ProviderError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)
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

_FINISH_REASON_MAP: dict[str | None, FinishReason] = {
    "stop": FinishReason.stop,
    "length": FinishReason.length,
    "tool_calls": FinishReason.tool_calls,
    "function_call": FinishReason.tool_calls,
    "content_filter": FinishReason.content_filter,
}


def _message_to_dict(message: Message) -> dict[str, Any]:
    payload: dict[str, Any] = {"role": message.role.value}
    if message.content is not None:
        payload["content"] = message.content
    if message.tool_call_id is not None:
        payload["tool_call_id"] = message.tool_call_id
    if message.name is not None:
        payload["name"] = message.name
    if message.tool_calls:
        payload["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
            }
            for call in message.tool_calls
        ]
    return payload


def translate_request(request: ModelRequest) -> dict[str, Any]:
    """Build the kwargs for `client.chat.completions.create(**kwargs)`."""
    messages: list[dict[str, Any]] = []

    system_text = request.system
    turns = request.messages
    if system_text is None and turns and turns[0].role is Role.system:
        system_text = turns[0].content
        turns = turns[1:]
    if system_text:
        messages.append({"role": "system", "content": system_text})
    messages.extend(_message_to_dict(m) for m in turns)

    kwargs: dict[str, Any] = {"model": request.model, "messages": messages}
    if request.temperature is not None:
        kwargs["temperature"] = request.temperature
    if request.max_output_tokens is not None:
        kwargs["max_completion_tokens"] = request.max_output_tokens
    if request.stop_sequences:
        kwargs["stop"] = request.stop_sequences
    if request.tools:
        kwargs["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            }
            for tool in request.tools
        ]
    return kwargs


def translate_response(completion: Any, *, provider: str) -> ModelResponse:
    """Translate an OpenAI-shaped `ChatCompletion` object into a `ModelResponse`."""
    try:
        choice = completion.choices[0]
        message = choice.message
    except (IndexError, AttributeError) as exc:
        from app.ai.errors import MalformedResponseError

        raise MalformedResponseError(
            f"Response had no usable choice: {exc}", provider=provider
        ) from exc

    tool_calls = [
        ToolCall(
            id=call.id,
            name=call.function.name,
            arguments=_safe_json_loads(call.function.arguments),
        )
        for call in (message.tool_calls or [])
    ]

    usage_obj = getattr(completion, "usage", None)
    usage = (
        Usage(
            input_tokens=getattr(usage_obj, "prompt_tokens", None),
            output_tokens=getattr(usage_obj, "completion_tokens", None),
            total_tokens=getattr(usage_obj, "total_tokens", None),
        )
        if usage_obj is not None
        else Usage.unavailable()
    )

    return ModelResponse(
        content=message.content,
        provider=provider,
        model=getattr(completion, "model", None) or "",
        finish_reason=_FINISH_REASON_MAP.get(choice.finish_reason, FinishReason.unknown),
        usage=usage,
        tool_calls=tool_calls,
        request_id=getattr(completion, "id", None),
    )


def _safe_json_loads(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except (json.JSONDecodeError, TypeError):
        return {}


async def translate_stream(
    chunks: AsyncIterator[Any], *, provider: str, model: str
) -> AsyncIterator[StreamEvent]:
    """Translate an OpenAI-shaped `ChatCompletionChunk` stream into `StreamEvent`s.

    Accumulates tool-call argument fragments (which arrive incrementally,
    keyed by index) so the final `CompletedEvent.response` contains fully
    assembled `ToolCall`s, while still emitting a `ToolCallDeltaEvent` per
    fragment for callers that want to render progress live.
    """
    content_parts: list[str] = []
    tool_call_accumulators: dict[int, dict[str, Any]] = {}
    finish_reason: str | None = None
    response_id: str | None = None
    response_model = model
    usage = Usage.unavailable()

    try:
        async for chunk in chunks:
            response_id = getattr(chunk, "id", None) or response_id
            response_model = getattr(chunk, "model", None) or response_model
            chunk_usage = getattr(chunk, "usage", None)
            if chunk_usage is not None:
                usage = Usage(
                    input_tokens=getattr(chunk_usage, "prompt_tokens", None),
                    output_tokens=getattr(chunk_usage, "completion_tokens", None),
                    total_tokens=getattr(chunk_usage, "total_tokens", None),
                )

            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            finish_reason = choice.finish_reason or finish_reason
            delta = choice.delta

            if getattr(delta, "content", None):
                content_parts.append(delta.content)
                yield TextDeltaEvent(text=delta.content)

            for tool_call_delta in getattr(delta, "tool_calls", None) or []:
                index = tool_call_delta.index
                accumulator = tool_call_accumulators.setdefault(
                    index, {"id": None, "name": None, "arguments": ""}
                )
                call_id = getattr(tool_call_delta, "id", None)
                function = getattr(tool_call_delta, "function", None)
                name = getattr(function, "name", None) if function else None
                arguments_fragment = getattr(function, "arguments", None) if function else None

                if call_id:
                    accumulator["id"] = call_id
                if name:
                    accumulator["name"] = name
                if arguments_fragment:
                    accumulator["arguments"] += arguments_fragment

                yield ToolCallDeltaEvent(
                    index=index, id=call_id, name=name, arguments_delta=arguments_fragment
                )
    except Exception as exc:  # noqa: BLE001 -- normalized and re-raised as an ErrorEvent below
        error = (
            exc
            if isinstance(exc, ProviderError)
            else classify_error(exc, provider=provider, model=model)
        )
        yield ErrorEvent(error=error.to_info())
        return

    tool_calls = [
        ToolCall(
            id=acc["id"] or f"{provider}-tool-call-{index}",
            name=acc["name"] or "",
            arguments=_safe_json_loads(acc["arguments"]),
        )
        for index, acc in sorted(tool_call_accumulators.items())
    ]

    yield UsageEvent(usage=usage)
    yield CompletedEvent(
        response=ModelResponse(
            content="".join(content_parts) or None,
            provider=provider,
            model=response_model,
            finish_reason=_FINISH_REASON_MAP.get(finish_reason, FinishReason.unknown),
            usage=usage,
            tool_calls=tool_calls,
            request_id=response_id,
        )
    )


def classify_error(exc: Exception, *, provider: str, model: str | None) -> ProviderError:
    """Classify an exception raised by an OpenAI-compatible SDK client.

    Uses duck typing (a `status_code` attribute, and the exception class
    name) rather than importing `openai`/`groq`/`cerebras.cloud.sdk`
    exception types explicitly, since all three SDKs are generated by the
    same underlying toolchain and expose the same `APIStatusError`-style
    shape. This is what lets Groq/Cerebras/OpenRouter share one classifier
    instead of three near-identical ones.
    """
    status_code = getattr(exc, "status_code", None)
    provider_request_id = getattr(exc, "request_id", None)
    type_name = type(exc).__name__
    message = str(exc)

    kwargs: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "status_code": status_code,
        "provider_request_id": provider_request_id,
    }

    if "Timeout" in type_name:
        return ProviderTimeoutError(message, **kwargs)
    if "Connection" in type_name:
        return ProviderUnavailableError(message, **kwargs)
    if status_code in (401, 403):
        return AuthenticationError(message, **kwargs)
    if status_code == 429:
        return RateLimitError(message, **kwargs)
    if status_code == 404:
        return ModelNotFoundError(message, **kwargs)
    if status_code is not None and 400 <= status_code < 500:
        return InvalidRequestError(message, **kwargs)
    if status_code is not None and status_code >= 500:
        return ProviderUnavailableError(message, **kwargs)
    return ProviderError(message, **kwargs)
