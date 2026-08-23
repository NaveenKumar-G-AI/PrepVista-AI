"""Tests for `app.ai.providers.openai_compatible` -- the shared translation
logic used by the Groq, Cerebras, and OpenRouter adapters.
"""

from __future__ import annotations

from app.ai.errors import (
    AuthenticationError,
    InvalidRequestError,
    MalformedResponseError,
    ModelNotFoundError,
    ProviderError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.ai.providers.openai_compatible import (
    classify_error,
    translate_request,
    translate_response,
    translate_stream,
)
from app.ai.types import FinishReason, Message, ModelRequest, Role, ToolDefinition
from tests.unit.ai.fakes import (
    FakeAPIConnectionError,
    FakeAPIError,
    FakeAPITimeoutError,
    fake_choice,
    fake_chunk,
    fake_chunk_choice,
    fake_completion,
    fake_message,
    fake_tool_call,
    fake_tool_call_delta,
    fake_usage,
)

# --- translate_request -------------------------------------------------


def test_translate_request_builds_minimal_kwargs() -> None:
    request = ModelRequest(messages=[Message(role=Role.user, content="hi")], model="llama-x")

    kwargs = translate_request(request)

    assert kwargs["model"] == "llama-x"
    assert kwargs["messages"] == [{"role": "user", "content": "hi"}]
    assert "temperature" not in kwargs


def test_translate_request_promotes_system_field_to_leading_message() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")], model="m", system="Be concise."
    )

    kwargs = translate_request(request)

    assert kwargs["messages"][0] == {"role": "system", "content": "Be concise."}
    assert kwargs["messages"][1] == {"role": "user", "content": "hi"}


def test_translate_request_reuses_leading_system_message_if_present() -> None:
    request = ModelRequest(
        messages=[
            Message(role=Role.system, content="Be concise."),
            Message(role=Role.user, content="hi"),
        ],
        model="m",
    )

    kwargs = translate_request(request)

    assert kwargs["messages"][0] == {"role": "system", "content": "Be concise."}
    assert len(kwargs["messages"]) == 2


def test_translate_request_maps_optional_parameters() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")],
        model="m",
        temperature=0.5,
        max_output_tokens=100,
        stop_sequences=["END"],
    )

    kwargs = translate_request(request)

    assert kwargs["temperature"] == 0.5
    assert kwargs["max_completion_tokens"] == 100
    assert kwargs["stop"] == ["END"]


def test_translate_request_includes_tool_definitions() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")],
        model="m",
        tools=[
            ToolDefinition(
                name="read_file", description="Reads a file.", input_schema={"type": "object"}
            )
        ],
    )

    kwargs = translate_request(request)

    assert kwargs["tools"] == [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Reads a file.",
                "parameters": {"type": "object"},
            },
        }
    ]


def test_translate_request_serializes_assistant_tool_calls() -> None:
    from app.ai.types import ToolCall

    request = ModelRequest(
        messages=[
            Message(role=Role.user, content="read it"),
            Message(
                role=Role.assistant,
                content=None,
                tool_calls=[ToolCall(id="call-1", name="read_file", arguments={"path": "a.txt"})],
            ),
            Message(
                role=Role.tool, content="file contents", tool_call_id="call-1", name="read_file"
            ),
        ],
        model="m",
    )

    kwargs = translate_request(request)

    assistant_msg = kwargs["messages"][1]
    assert assistant_msg["tool_calls"][0]["id"] == "call-1"
    assert assistant_msg["tool_calls"][0]["function"]["name"] == "read_file"
    tool_msg = kwargs["messages"][2]
    assert tool_msg["tool_call_id"] == "call-1"
    assert tool_msg["content"] == "file contents"


# --- translate_response --------------------------------------------------


def test_translate_response_normalizes_basic_completion() -> None:
    completion = fake_completion(
        [fake_choice(fake_message(content="Hello there"), finish_reason="stop")],
        usage=fake_usage(prompt_tokens=10, completion_tokens=3, total_tokens=13),
        model="llama-x",
        id="resp-1",
    )

    response = translate_response(completion, provider="groq")

    assert response.content == "Hello there"
    assert response.provider == "groq"
    assert response.model == "llama-x"
    assert response.finish_reason == FinishReason.stop
    assert response.usage.input_tokens == 10
    assert response.usage.output_tokens == 3
    assert response.usage.total_tokens == 13
    assert response.request_id == "resp-1"


def test_translate_response_handles_missing_usage() -> None:
    completion = fake_completion([fake_choice(fake_message(content="hi"))], usage=None)

    response = translate_response(completion, provider="groq")

    assert response.usage.input_tokens is None
    assert response.usage.output_tokens is None


def test_translate_response_normalizes_tool_calls() -> None:
    completion = fake_completion(
        [
            fake_choice(
                fake_message(
                    content=None,
                    tool_calls=[fake_tool_call("call-1", "read_file", '{"path": "a.txt"}')],
                ),
                finish_reason="tool_calls",
            )
        ]
    )

    response = translate_response(completion, provider="groq")

    assert response.finish_reason == FinishReason.tool_calls
    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].id == "call-1"
    assert response.tool_calls[0].name == "read_file"
    assert response.tool_calls[0].arguments == {"path": "a.txt"}


def test_translate_response_handles_malformed_tool_call_arguments_gracefully() -> None:
    completion = fake_completion(
        [
            fake_choice(
                fake_message(
                    content=None, tool_calls=[fake_tool_call("call-1", "read_file", "not json")]
                ),
                finish_reason="tool_calls",
            )
        ]
    )

    response = translate_response(completion, provider="groq")

    assert response.tool_calls[0].arguments == {}


def test_translate_response_raises_malformed_response_error_when_no_choices() -> None:
    empty_completion = fake_completion([])

    try:
        translate_response(empty_completion, provider="groq")
        raised = False
    except MalformedResponseError:
        raised = True
    assert raised


def test_translate_response_maps_unknown_finish_reason() -> None:
    completion = fake_completion(
        [fake_choice(fake_message(content="hi"), finish_reason="something_new")]
    )

    response = translate_response(completion, provider="groq")

    assert response.finish_reason == FinishReason.unknown


# --- translate_stream --------------------------------------------------


async def test_translate_stream_emits_text_deltas_then_completed() -> None:
    chunks = [
        fake_chunk([fake_chunk_choice(content="Hel")]),
        fake_chunk([fake_chunk_choice(content="lo")]),
        fake_chunk(
            [fake_chunk_choice(finish_reason="stop")],
            usage=fake_usage(prompt_tokens=5, completion_tokens=2, total_tokens=7),
        ),
    ]

    async def chunk_iter():
        for chunk in chunks:
            yield chunk

    events = [event async for event in translate_stream(chunk_iter(), provider="groq", model="m")]

    event_types = [event.type for event in events]
    assert event_types == ["text_delta", "text_delta", "usage", "completed"]
    assert events[0].text == "Hel"
    assert events[1].text == "lo"
    assert events[-1].response.content == "Hello"
    assert events[-1].response.finish_reason == FinishReason.stop
    assert events[-1].response.usage.total_tokens == 7


async def test_translate_stream_accumulates_tool_call_deltas() -> None:
    chunks = [
        fake_chunk(
            [fake_chunk_choice(tool_calls=[fake_tool_call_delta(0, id="call-1", name="read_file")])]
        ),
        fake_chunk([fake_chunk_choice(tool_calls=[fake_tool_call_delta(0, arguments='{"path"')])]),
        fake_chunk(
            [fake_chunk_choice(tool_calls=[fake_tool_call_delta(0, arguments=': "a.txt"}')])]
        ),
        fake_chunk([fake_chunk_choice(finish_reason="tool_calls")]),
    ]

    async def chunk_iter():
        for chunk in chunks:
            yield chunk

    events = [event async for event in translate_stream(chunk_iter(), provider="groq", model="m")]

    tool_deltas = [e for e in events if e.type == "tool_call_delta"]
    assert len(tool_deltas) == 3
    completed = events[-1]
    assert completed.type == "completed"
    assert completed.response.tool_calls[0].name == "read_file"
    assert completed.response.tool_calls[0].arguments == {"path": "a.txt"}


async def test_translate_stream_yields_error_event_on_mid_stream_failure() -> None:
    async def chunk_iter():
        yield fake_chunk([fake_chunk_choice(content="partial")])
        raise FakeAPIError("connection dropped", status_code=None)

    events = [event async for event in translate_stream(chunk_iter(), provider="groq", model="m")]

    assert events[0].type == "text_delta"
    assert events[-1].type == "error"


# --- classify_error --------------------------------------------------


def test_classify_error_maps_status_codes() -> None:
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=401), provider="p", model="m"),
        AuthenticationError,
    )
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=403), provider="p", model="m"),
        AuthenticationError,
    )
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=429), provider="p", model="m"), RateLimitError
    )
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=404), provider="p", model="m"),
        ModelNotFoundError,
    )
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=400), provider="p", model="m"),
        InvalidRequestError,
    )
    assert isinstance(
        classify_error(FakeAPIError("x", status_code=500), provider="p", model="m"),
        ProviderUnavailableError,
    )


def test_classify_error_maps_timeout_by_class_name() -> None:
    error = classify_error(FakeAPITimeoutError("timed out"), provider="p", model="m")

    assert isinstance(error, ProviderTimeoutError)


def test_classify_error_maps_connection_error_by_class_name() -> None:
    error = classify_error(FakeAPIConnectionError("no connection"), provider="p", model="m")

    assert isinstance(error, ProviderUnavailableError)


def test_classify_error_falls_back_to_base_provider_error() -> None:
    error = classify_error(ValueError("mystery failure"), provider="p", model="m")

    assert type(error) is ProviderError


def test_classify_error_preserves_provider_request_id() -> None:
    error = classify_error(
        FakeAPIError("x", status_code=429, request_id="req-abc"), provider="p", model="m"
    )

    assert error.provider_request_id == "req-abc"
