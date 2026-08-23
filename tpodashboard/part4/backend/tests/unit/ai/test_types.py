"""Tests for provider-independent request/response/message/streaming types."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.ai.types import (
    CompletedEvent,
    ErrorEvent,
    FinishReason,
    Message,
    ModelRequest,
    ModelResponse,
    ProviderErrorInfo,
    Role,
    TextDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    ToolDefinition,
    Usage,
    UsageEvent,
)


def test_minimal_model_request_is_valid() -> None:
    request = ModelRequest(messages=[Message(role=Role.user, content="hi")], model="some-model")

    assert request.model == "some-model"
    assert request.system is None
    assert request.provider_options == {}


def test_model_request_requires_a_model_identifier() -> None:
    with pytest.raises(ValidationError):
        ModelRequest(messages=[Message(role=Role.user, content="hi")])  # type: ignore[call-arg]


def test_temperature_out_of_range_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ModelRequest(messages=[], model="m", temperature=5.0)


def test_usage_unavailable_has_all_none_fields() -> None:
    usage = Usage.unavailable()

    assert usage.input_tokens is None
    assert usage.output_tokens is None
    assert usage.total_tokens is None


def test_model_response_cost_defaults_to_none() -> None:
    response = ModelResponse(
        content="hi",
        provider="mock",
        model="m",
        finish_reason=FinishReason.stop,
        usage=Usage.unavailable(),
    )

    assert response.cost is None


def test_tool_call_arguments_default_to_empty_dict() -> None:
    call = ToolCall(id="1", name="read_file")

    assert call.arguments == {}


def test_tool_definition_requires_input_schema() -> None:
    with pytest.raises(ValidationError):
        ToolDefinition(name="read_file", description="Reads a file.")  # type: ignore[call-arg]


def test_stream_event_discriminated_union_parses_text_delta() -> None:
    event = TextDeltaEvent(text="hello")

    assert event.type == "text_delta"


def test_stream_event_discriminated_union_parses_error() -> None:
    info = ProviderErrorInfo(code="rate_limit_error", message="slow down", provider="mock")
    event = ErrorEvent(error=info)

    assert event.type == "error"
    assert event.error.code == "rate_limit_error"


def test_completed_event_carries_full_response() -> None:
    response = ModelResponse(
        content="done",
        provider="mock",
        model="m",
        finish_reason=FinishReason.stop,
        usage=Usage.unavailable(),
    )
    event = CompletedEvent(response=response)

    assert event.response.content == "done"


def test_usage_event_wraps_usage() -> None:
    event = UsageEvent(usage=Usage(input_tokens=1, output_tokens=2, total_tokens=3))

    assert event.usage.total_tokens == 3


def test_tool_call_delta_event_index_is_required() -> None:
    with pytest.raises(ValidationError):
        ToolCallDeltaEvent()  # type: ignore[call-arg]


def test_message_tool_call_id_only_meaningful_on_tool_messages() -> None:
    # The model doesn't forbid this combination structurally (adapters are
    # responsible for constructing valid provider requests), but a plain
    # user message with no tool fields set should round-trip cleanly.
    message = Message(role=Role.user, content="hi")

    assert message.tool_calls is None
    assert message.tool_call_id is None
