"""Fake SDK client/response objects for testing provider adapters.

Each fake mimics only the attributes the corresponding adapter actually
reads (duck typing), not a full reconstruction of the real SDK's response
classes -- that's deliberate: it keeps these fakes small and makes it
obvious exactly what shape each adapter depends on. Every adapter test in
this package injects one of these via the adapter's `client=` constructor
parameter, so no test ever makes a real network call.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

# --- OpenAI-compatible fakes (Groq, Cerebras, OpenRouter) -------------------


class FakeAPIError(Exception):
    """Mimics the `status_code`/`request_id` shape shared by the openai,
    groq, and cerebras SDKs' exception classes (see
    `app.ai.providers.openai_compatible.classify_error`, which classifies
    by duck-typed attributes and class-name substring rather than an
    imported exception type)."""

    def __init__(
        self, message: str, *, status_code: int | None = None, request_id: str | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id


class FakeAPITimeoutError(FakeAPIError):
    """Class name deliberately contains 'Timeout' -- see `classify_error`."""


class FakeAPIConnectionError(FakeAPIError):
    """Class name deliberately contains 'Connection' -- see `classify_error`."""


def fake_function(name: str, arguments: str) -> SimpleNamespace:
    return SimpleNamespace(name=name, arguments=arguments)


def fake_tool_call(id: str, name: str, arguments: str) -> SimpleNamespace:  # noqa: A002
    return SimpleNamespace(id=id, function=fake_function(name, arguments))


def fake_message(
    content: str | None = None, tool_calls: list[Any] | None = None
) -> SimpleNamespace:
    return SimpleNamespace(content=content, tool_calls=tool_calls)


def fake_choice(message: SimpleNamespace, finish_reason: str = "stop") -> SimpleNamespace:
    return SimpleNamespace(message=message, finish_reason=finish_reason)


def fake_usage(
    prompt_tokens: int | None = 10, completion_tokens: int | None = 5, total_tokens: int | None = 15
) -> SimpleNamespace:
    return SimpleNamespace(
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, total_tokens=total_tokens
    )


def fake_completion(
    choices: list[SimpleNamespace],
    *,
    usage: SimpleNamespace | None = None,
    model: str = "fake-model-x",
    id: str = "fake-completion-id",  # noqa: A002
) -> SimpleNamespace:
    return SimpleNamespace(choices=choices, usage=usage, model=model, id=id)


def fake_chunk_choice(
    *,
    content: str | None = None,
    tool_calls: list[Any] | None = None,
    finish_reason: str | None = None,
) -> SimpleNamespace:
    delta = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(delta=delta, finish_reason=finish_reason)


def fake_tool_call_delta(
    index: int,
    *,
    id: str | None = None,
    name: str | None = None,
    arguments: str | None = None,  # noqa: A002
) -> SimpleNamespace:
    function = SimpleNamespace(name=name, arguments=arguments) if (name or arguments) else None
    return SimpleNamespace(index=index, id=id, function=function)


def fake_chunk(
    choices: list[SimpleNamespace],
    *,
    usage: SimpleNamespace | None = None,
    id: str = "fake-chunk-id",  # noqa: A002
    model: str = "fake-model-x",
) -> SimpleNamespace:
    return SimpleNamespace(choices=choices, usage=usage, id=id, model=model)


class _FakeChatCompletions:
    def __init__(
        self,
        *,
        response: SimpleNamespace | None = None,
        stream_chunks: list[SimpleNamespace] | None = None,
        error: Exception | None = None,
    ) -> None:
        self._response = response
        self._stream_chunks = stream_chunks or []
        self._error = error
        self.last_kwargs: dict[str, Any] | None = None

    async def create(self, *, stream: bool = False, **kwargs: Any) -> Any:
        self.last_kwargs = kwargs
        if self._error is not None:
            raise self._error
        if stream:
            return self._iter_chunks()
        return self._response

    async def _iter_chunks(self) -> AsyncIterator[SimpleNamespace]:
        for chunk in self._stream_chunks:
            yield chunk


class _FakeModels:
    def __init__(self, *, list_error: Exception | None = None) -> None:
        self._list_error = list_error

    async def list(self) -> list[Any]:
        if self._list_error is not None:
            raise self._list_error
        return []


class FakeOpenAICompatibleClient:
    """Fake for the shared `.chat.completions.create()` / `.models.list()`
    shape used by the Groq, Cerebras, and OpenRouter SDK clients."""

    def __init__(
        self,
        *,
        response: SimpleNamespace | None = None,
        stream_chunks: list[SimpleNamespace] | None = None,
        error: Exception | None = None,
        list_error: Exception | None = None,
    ) -> None:
        self.chat = SimpleNamespace(
            completions=_FakeChatCompletions(
                response=response, stream_chunks=stream_chunks, error=error
            )
        )
        self.models = _FakeModels(list_error=list_error)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


# --- Gemini fakes ----------------------------------------------------------


def fake_function_call(name: str, args: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(name=name, args=args, id=None)


def fake_part(
    text: str | None = None, function_call: SimpleNamespace | None = None
) -> SimpleNamespace:
    return SimpleNamespace(text=text, function_call=function_call)


def fake_gemini_content(parts: list[SimpleNamespace]) -> SimpleNamespace:
    return SimpleNamespace(parts=parts)


def fake_finish_reason(name: str) -> SimpleNamespace:
    return SimpleNamespace(name=name)


def fake_candidate(content: SimpleNamespace, finish_reason: str = "STOP") -> SimpleNamespace:
    return SimpleNamespace(content=content, finish_reason=fake_finish_reason(finish_reason))


def fake_usage_metadata(
    prompt_token_count: int | None = 10,
    candidates_token_count: int | None = 5,
    total_token_count: int | None = 15,
) -> SimpleNamespace:
    return SimpleNamespace(
        prompt_token_count=prompt_token_count,
        candidates_token_count=candidates_token_count,
        total_token_count=total_token_count,
    )


def fake_gemini_response(
    *,
    text: str | None = None,
    candidates: list[SimpleNamespace] | None = None,
    usage_metadata: SimpleNamespace | None = None,
    model_version: str = "fake-gemini-model",
    response_id: str = "fake-gemini-response-id",
) -> SimpleNamespace:
    return SimpleNamespace(
        text=text,
        candidates=candidates or [],
        usage_metadata=usage_metadata,
        model_version=model_version,
        response_id=response_id,
    )


class _FakeGeminiModels:
    def __init__(
        self,
        *,
        response: SimpleNamespace | None = None,
        stream_chunks: list[SimpleNamespace] | None = None,
        error: Exception | None = None,
        list_error: Exception | None = None,
    ) -> None:
        self._response = response
        self._stream_chunks = stream_chunks or []
        self._error = error
        self._list_error = list_error
        self.last_kwargs: dict[str, Any] | None = None

    async def generate_content(self, **kwargs: Any) -> SimpleNamespace:
        self.last_kwargs = kwargs
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response

    async def generate_content_stream(self, **kwargs: Any) -> AsyncIterator[SimpleNamespace]:
        self.last_kwargs = kwargs
        if self._error is not None:
            raise self._error
        return self._iter_chunks()

    async def _iter_chunks(self) -> AsyncIterator[SimpleNamespace]:
        for chunk in self._stream_chunks:
            yield chunk

    async def list(self, **kwargs: Any) -> list[Any]:
        if self._list_error is not None:
            raise self._list_error
        return []


class FakeGeminiClient:
    """Fake for `google.genai.Client`'s async surface (`client.aio.models`)."""

    def __init__(
        self,
        *,
        response: SimpleNamespace | None = None,
        stream_chunks: list[SimpleNamespace] | None = None,
        error: Exception | None = None,
        list_error: Exception | None = None,
    ) -> None:
        models = _FakeGeminiModels(
            response=response, stream_chunks=stream_chunks, error=error, list_error=list_error
        )
        self.aio = SimpleNamespace(models=models)
        self._models = models

    @property
    def last_kwargs(self) -> dict[str, Any] | None:
        return self._models.last_kwargs


class FakeGeminiAPIError(Exception):
    """Mimics `google.genai.errors.APIError`'s `.code` / `.message` shape."""

    def __init__(self, message: str, *, code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# --- Scenario builders shared by every provider's contract tests -----------

_CONTRACT_TEXT = "Contract test response."


def openai_compatible_client_for_scenario(scenario: str) -> FakeOpenAICompatibleClient:
    """Build a `FakeOpenAICompatibleClient` for one of the shared contract
    scenarios (see `tests/unit/ai/contract.py`). Reused by the Groq,
    Cerebras, and OpenRouter contract test modules since all three share
    the same OpenAI-compatible wire shape."""
    if scenario == "success":
        return FakeOpenAICompatibleClient(
            response=fake_completion(
                [fake_choice(fake_message(content=_CONTRACT_TEXT), finish_reason="stop")],
                usage=fake_usage(),
            ),
            stream_chunks=[
                fake_chunk([fake_chunk_choice(content="Contract ")]),
                fake_chunk([fake_chunk_choice(content="test response.")]),
                fake_chunk([fake_chunk_choice(finish_reason="stop")], usage=fake_usage()),
            ],
        )
    if scenario == "tool_call":
        tool_call = fake_tool_call("call-1", "read_file", '{"path": "a.txt"}')
        return FakeOpenAICompatibleClient(
            response=fake_completion(
                [
                    fake_choice(
                        fake_message(content=None, tool_calls=[tool_call]),
                        finish_reason="tool_calls",
                    )
                ]
            ),
            stream_chunks=[
                fake_chunk(
                    [
                        fake_chunk_choice(
                            tool_calls=[fake_tool_call_delta(0, id="call-1", name="read_file")]
                        )
                    ]
                ),
                fake_chunk(
                    [
                        fake_chunk_choice(
                            tool_calls=[fake_tool_call_delta(0, arguments='{"path": "a.txt"}')]
                        )
                    ]
                ),
                fake_chunk([fake_chunk_choice(finish_reason="tool_calls")]),
            ],
        )
    if scenario == "rate_limit":
        return FakeOpenAICompatibleClient(error=FakeAPIError("rate limited", status_code=429))
    if scenario == "timeout":
        return FakeOpenAICompatibleClient(error=FakeAPITimeoutError("request timed out"))
    raise ValueError(f"unknown contract scenario: {scenario!r}")


def gemini_client_for_scenario(scenario: str) -> FakeGeminiClient:
    """Build a `FakeGeminiClient` for one of the shared contract scenarios.
    See `openai_compatible_client_for_scenario` for the sibling used by the
    other three providers."""
    if scenario == "success":
        first_part = fake_part(text="Contract ")
        second_part = fake_part(text="test response.")
        return FakeGeminiClient(
            response=fake_gemini_response(
                text=_CONTRACT_TEXT,
                candidates=[fake_candidate(fake_gemini_content([fake_part(text=_CONTRACT_TEXT)]))],
                usage_metadata=fake_usage_metadata(),
            ),
            stream_chunks=[
                fake_gemini_response(
                    text="Contract ", candidates=[fake_candidate(fake_gemini_content([first_part]))]
                ),
                fake_gemini_response(
                    text="test response.",
                    candidates=[
                        fake_candidate(fake_gemini_content([second_part]), finish_reason="STOP")
                    ],
                    usage_metadata=fake_usage_metadata(),
                ),
            ],
        )
    if scenario == "tool_call":
        call = fake_function_call("read_file", {"path": "a.txt"})
        content = fake_gemini_content([fake_part(function_call=call)])
        return FakeGeminiClient(
            response=fake_gemini_response(
                text=None,
                candidates=[fake_candidate(content, finish_reason="STOP")],
                usage_metadata=fake_usage_metadata(),
            ),
            stream_chunks=[
                fake_gemini_response(
                    text=None,
                    candidates=[fake_candidate(content, finish_reason="STOP")],
                    usage_metadata=fake_usage_metadata(),
                )
            ],
        )
    if scenario == "rate_limit":
        return FakeGeminiClient(error=FakeGeminiAPIError("rate limited", code=429))
    if scenario == "timeout":
        return FakeGeminiClient(error=FakeAPITimeoutError("request timed out"))
    raise ValueError(f"unknown contract scenario: {scenario!r}")
